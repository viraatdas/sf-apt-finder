"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import dynamic from "next/dynamic";
import {
  Check, X, HelpCircle, ExternalLink, MapPin, Bed, Bath, Maximize2,
  ChevronLeft, ChevronRight, RotateCcw, Keyboard,
} from "lucide-react";
import { formatMoney } from "@/lib/utils";
import type { Listing } from "@/lib/db/schema";

const ListingMap = dynamic(() => import("./listing-map").then((m) => m.ListingMap), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-ink-100 animate-pulse rounded-xl" />,
});

type Decision = "yes" | "no" | "maybe";

export interface CardHandle {
  swipe: (direction: Decision) => Promise<void>;
  nextPhoto: () => void;
  prevPhoto: () => void;
}

export function SwipeDeck({ initial }: { initial: Listing[] }) {
  const [deck, setDeck] = useState(initial);
  const [history, setHistory] = useState<Array<{ listing: Listing; decision: Decision }>>([]);
  const [hoverDecision, setHoverDecision] = useState<Decision | null>(null);
  // photoIdx lives here (not inside SwipeCard) so the keyboard handler can
  // update it directly without ref indirection. Reset to 0 on top change.
  const [photoIdx, setPhotoIdx] = useState(0);
  const topRef = useRef<CardHandle | null>(null);
  const top = deck[0];
  const topPhotos = (top?.photoUrls as string[] | null) ?? [];

  useEffect(() => {
    setPhotoIdx(0);
  }, [top?.id]);

  const nextPhoto = useCallback(() => {
    if (topPhotos.length < 2) return;
    setPhotoIdx((i) => (i + 1) % topPhotos.length);
  }, [topPhotos.length]);

  const prevPhoto = useCallback(() => {
    if (topPhotos.length < 2) return;
    setPhotoIdx((i) => (i === 0 ? topPhotos.length - 1 : i - 1));
  }, [topPhotos.length]);

  async function decide(listing: Listing, decision: Decision, skipAnim = false) {
    if (!skipAnim && topRef.current && listing.id === top?.id) {
      await topRef.current.swipe(decision);
    }
    setHistory((h) => [...h, { listing, decision }]);
    setDeck((d) => d.filter((l) => l.id !== listing.id));
    setHoverDecision(null);
    try {
      await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, decision }),
      });
    } catch (err) {
      console.warn("decision save failed", err);
    }
  }

  async function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setDeck((d) => [last.listing, ...d]);
    try {
      await fetch(`/api/decisions?listingId=${encodeURIComponent(last.listing.id)}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.warn("undo failed", err);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack typing in form fields.
      const active = document.activeElement as HTMLElement | null;
      if (active && ["INPUT", "TEXTAREA"].includes(active.tagName)) return;
      if (!top) return;
      // Release any focused button so its native space/enter activation
      // doesn't fire after we handle the key.
      if (active && active instanceof HTMLButtonElement) active.blur();

      if (e.key === "ArrowLeft") { e.preventDefault(); decide(top, "no"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); decide(top, "yes"); }
      else if (e.key === "ArrowUp") { e.preventDefault(); decide(top, "maybe"); }
      else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        nextPhoto();
      }
      else if (e.key === "ArrowDown") { e.preventDefault(); prevPhoto(); }
      else if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); }
      // (no help-toggle key — shortcuts are always visible in the top bar)
    }
    // Capture phase so we beat any focused button's default activation.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top?.id, history.length, nextPhoto, prevPhoto]);

  const pins = useMemo(() => {
    const recent = history.slice(-30);
    return [
      ...deck.slice(0, 60).map((l) => ({
        id: l.id,
        lat: l.lat!,
        lng: l.lng!,
        title: l.title,
        price: l.price ?? 0,
        neighborhood: l.neighborhood,
        decision: null,
        highlighted: l.id === top?.id,
        url: (l.sources as any)?.[0]?.url,
      })),
      ...recent.map((h) => ({
        id: h.listing.id + "_d",
        lat: h.listing.lat!,
        lng: h.listing.lng!,
        title: h.listing.title,
        price: h.listing.price ?? 0,
        neighborhood: h.listing.neighborhood,
        decision: h.decision,
        url: (h.listing.sources as any)?.[0]?.url,
      })),
    ].filter((p) => p.lat != null && p.lng != null) as any;
  }, [deck, history, top]);

  const focus = top?.lat && top?.lng ? { lat: top.lat, lng: top.lng } : undefined;

  if (!top) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-display mb-2">You're all caught up</h2>
        <p className="text-ink-900/60 mb-6">No more listings to review. New ones land daily at 7:05 AM.</p>
        {history.length > 0 && (
          <button onClick={undo} className="px-4 py-2 rounded-full bg-ink-100 hover:bg-ink-100/80">
            Undo last
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(720px,860px)] gap-4 xl:gap-8 max-w-[1900px] mx-auto px-4 py-4 xl:px-6 xl:py-6">
      {/* Map */}
      <div className="h-[40vh] xl:h-[calc(100vh-7rem)] rounded-2xl overflow-hidden border border-ink-100 shadow-sm">
        <ListingMap pins={pins} focus={focus} />
      </div>

      {/* Card deck */}
      <div className="relative h-[72vh] xl:h-[calc(100vh-7rem)]">
        <AnimatePresence mode="popLayout">
          {deck.slice(0, 3).reverse().map((listing, i, arr) => {
            const isTop = i === arr.length - 1;
            return (
              <SwipeCard
                key={listing.id}
                ref={isTop ? topRef : null}
                listing={listing}
                isTop={isTop}
                depth={arr.length - 1 - i}
                photoIdx={isTop ? photoIdx : 0}
                onPhotoChange={isTop ? setPhotoIdx : () => {}}
                onDecide={(d) => decide(listing, d, true)}
                onHoverDecision={isTop ? setHoverDecision : undefined}
              />
            );
          })}
        </AnimatePresence>

        <ActionBar
          onDecide={(d) => decide(top, d)}
          onHover={setHoverDecision}
          canUndo={history.length > 0}
          onUndo={undo}
          hoverDecision={hoverDecision}
        />
        <DeckCounter remaining={deck.length} history={history} />
        <ShortcutBar />
      </div>
    </div>
  );
}

function ShortcutBar() {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[130]">
      <div className="bg-white/90 backdrop-blur border border-ink-100 shadow-sm rounded-full px-3.5 py-1.5 flex items-center gap-2 text-[11px] font-medium text-ink-900/70">
        <Kbd>←</Kbd><span className="text-accent-no font-semibold">nope</span>
        <span className="text-ink-900/20">·</span>
        <Kbd>↑</Kbd><span className="text-amber-600 font-semibold">maybe</span>
        <span className="text-ink-900/20">·</span>
        <Kbd>→</Kbd><span className="text-accent-yes font-semibold">yes</span>
        <span className="text-ink-900/20">·</span>
        <Kbd>space</Kbd><span>photo</span>
        <span className="text-ink-900/20">·</span>
        <Kbd>⌘Z</Kbd><span>undo</span>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 bg-ink-100 text-ink-900 rounded font-mono text-[10px] font-medium border border-ink-100/80 shadow-sm self-center">
      {children}
    </kbd>
  );
}

function DeckCounter({
  remaining,
  history,
}: {
  remaining: number;
  history: Array<{ decision: Decision }>;
}) {
  const yes = history.filter((h) => h.decision === "yes").length;
  const maybe = history.filter((h) => h.decision === "maybe").length;
  const no = history.filter((h) => h.decision === "no").length;
  return (
    <div className="absolute top-3 right-3 z-[130] flex items-center gap-2 text-xs font-medium">
      <div className="px-2.5 py-1 rounded-full bg-white/90 backdrop-blur border border-ink-100 shadow-sm">
        {remaining} left
      </div>
      <div className="px-2.5 py-1 rounded-full bg-white/90 backdrop-blur border border-ink-100 shadow-sm flex gap-2">
        <span className="text-accent-yes">♥ {yes}</span>
        <span className="text-amber-600">? {maybe}</span>
        <span className="text-accent-no opacity-60">✗ {no}</span>
      </div>
    </div>
  );
}

const SwipeCard = forwardRef<CardHandle, {
  listing: Listing;
  isTop: boolean;
  depth: number;
  photoIdx: number;
  onPhotoChange: (i: number) => void;
  onDecide: (d: Decision) => void;
  onHoverDecision?: (d: Decision | null) => void;
}>(function SwipeCard(
  { listing, isTop, depth, photoIdx, onPhotoChange, onDecide, onHoverDecision },
  ref
) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-700, 0, 700], [-45, 0, 45]);
  const yesOpacity = useTransform(x, [40, 160], [0, 1]);
  const noOpacity = useTransform(x, [-160, -40], [1, 0]);
  const maybeOpacity = useTransform(y, [-160, -40], [1, 0]);
  const photos = (listing.photoUrls as string[] | null) ?? [];
  const sources = (listing.sources as any[] | null) ?? [];
  const prices = (listing.pricesBySource as Record<string, number> | null) ?? {};

  useImperativeHandle(
    ref,
    () => ({
      swipe: async (direction) => {
        const ease = [0.22, 1, 0.36, 1] as const;
        if (direction === "yes") {
          // Big yes: 2400px throw, two-stage Y arc, full 0.7s flight.
          await Promise.all([
            animate(x, 2400, { duration: 0.7, ease }),
            (async () => {
              await animate(y, -220, { duration: 0.28, ease: [0.34, 0, 0.5, 1] as const });
              await animate(y, 160, { duration: 0.42, ease: [0.5, 0, 0.7, 1] as const });
            })(),
          ]);
        } else if (direction === "no") {
          await Promise.all([
            animate(x, -1800, { duration: 0.5, ease }),
            animate(y, -100, { duration: 0.5, ease }),
          ]);
        } else {
          await animate(y, -1400, { duration: 0.5, ease });
        }
      },
      // Kept for backwards-compat with old call sites; the parent now drives
      // photo state directly via the `photoIdx` prop + onPhotoChange callback.
      nextPhoto: () => onPhotoChange(photos.length ? (photoIdx + 1) % photos.length : 0),
      prevPhoto: () => onPhotoChange(photos.length ? (photoIdx === 0 ? photos.length - 1 : photoIdx - 1) : 0),
    }),
    [x, y, photos.length, photoIdx, onPhotoChange]
  );

  // Reactive hover decision based on drag
  useEffect(() => {
    if (!isTop || !onHoverDecision) return;
    const unsubX = x.on("change", (v) => {
      if (v > 80) onHoverDecision("yes");
      else if (v < -80) onHoverDecision("no");
      else if (y.get() < -80) onHoverDecision("maybe");
      else onHoverDecision(null);
    });
    const unsubY = y.on("change", (v) => {
      if (v < -80 && Math.abs(x.get()) < 80) onHoverDecision("maybe");
      else if (Math.abs(x.get()) < 80 && v > -80) onHoverDecision(null);
    });
    return () => { unsubX(); unsubY(); };
  }, [isTop, onHoverDecision, x, y]);

  function onDragEnd(_: any, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) {
    const { offset, velocity } = info;
    const tX = 130;
    const tY = 110;
    if (offset.x > tX || velocity.x > 700) onDecide("yes");
    else if (offset.x < -tX || velocity.x < -700) onDecide("no");
    else if (offset.y < -tY || velocity.y < -700) onDecide("maybe");
  }

  const currentPhoto = photos[photoIdx];

  return (
    <motion.div
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragEnd={onDragEnd}
      style={{
        x: isTop ? x : 0,
        y: isTop ? y : 0,
        rotate: isTop ? rotate : 0,
        scale: 1 - depth * 0.04,
        translateY: depth * 12,
        zIndex: 100 - depth,
      }}
      initial={{ opacity: 0, scale: 0.88, y: 60 }}
      animate={{ opacity: 1, scale: 1 - depth * 0.04 }}
      transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.9 }}
      exit={{
        opacity: 0,
        transition: { duration: 0.15, delay: 0.42 },
      }}
      className="absolute inset-0 bg-white rounded-3xl border border-ink-100 overflow-hidden cursor-grab active:cursor-grabbing shadow-2xl"
    >
      <div className="grid grid-rows-[58%_42%] h-full">
        {/* Photo area — tap left half to go back, right half to advance */}
        <motion.div
          className="relative bg-ink-100 overflow-hidden group"
          onTap={(e, info) => {
            if (!isTop || photos.length < 2) return;
            const moved = Math.abs(x.get()) + Math.abs(y.get());
            if (moved > 10) return;
            const target = e.currentTarget as HTMLElement;
            const rect = target.getBoundingClientRect();
            const rel = info.point.x - rect.left;
            if (rel < rect.width / 2) {
              onPhotoChange(photoIdx === 0 ? photos.length - 1 : photoIdx - 1);
            } else {
              onPhotoChange((photoIdx + 1) % photos.length);
            }
          }}
        >
          {currentPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentPhoto}
              alt={listing.title}
              className="w-full h-full object-cover select-none"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-ink-900/30 gap-2">
              <span className="text-6xl">🏠</span>
              <span className="text-xs text-ink-900/40">No photos for this one</span>
            </div>
          )}

          {photos.length > 1 && (
            <>
              <div className="absolute top-3 left-3 right-3 flex gap-1 pointer-events-none">
                {photos.slice(0, 12).map((_, i) => (
                  <div
                    key={i}
                    className={
                      "flex-1 h-1 rounded-full transition " +
                      (i === photoIdx ? "bg-white" : "bg-white/40")
                    }
                  />
                ))}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); onPhotoChange(photoIdx === 0 ? photos.length - 1 : photoIdx - 1); }}
                className="absolute top-1/2 left-2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 opacity-0 group-hover:opacity-100 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); onPhotoChange((photoIdx + 1) % photos.length); }}
                className="absolute top-1/2 right-2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 opacity-0 group-hover:opacity-100 transition"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute top-3 right-3 px-2 py-0.5 bg-black/40 backdrop-blur-sm rounded text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition pointer-events-none">
                {photoIdx + 1}/{photos.length}
              </div>
            </>
          )}

          {/* Decision stamps */}
          {isTop && (
            <>
              <motion.div
                style={{ opacity: yesOpacity }}
                className="absolute top-8 left-8 px-5 py-2 rounded-xl border-[5px] border-accent-yes text-accent-yes font-extrabold text-3xl bg-white/95 rotate-[-12deg] tracking-wider pointer-events-none"
              >
                YES
              </motion.div>
              <motion.div
                style={{ opacity: noOpacity }}
                className="absolute top-8 right-8 px-5 py-2 rounded-xl border-[5px] border-accent-no text-accent-no font-extrabold text-3xl bg-white/95 rotate-[12deg] tracking-wider pointer-events-none"
              >
                NOPE
              </motion.div>
              <motion.div
                style={{ opacity: maybeOpacity }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-5 py-2 rounded-xl border-[5px] border-accent-maybe text-amber-600 font-extrabold text-3xl bg-white/95 tracking-wider pointer-events-none"
              >
                MAYBE
              </motion.div>
            </>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white flex items-end justify-between gap-2 pointer-events-none">
            <div>
              <div className="text-4xl font-bold leading-none drop-shadow-lg">
                {formatMoney(listing.price)}
              </div>
              <div className="text-xs opacity-80 mt-1">per month</div>
            </div>
            {listing.neighborhood && (
              <div className="bg-white/95 text-ink-900 rounded-full px-3 py-1.5 text-sm font-semibold flex items-center gap-1 shadow-md">
                <MapPin className="w-3.5 h-3.5" /> {listing.neighborhood}
              </div>
            )}
          </div>
        </motion.div>

        {/* Details */}
        <div className="p-6 overflow-y-auto no-scrollbar">
          <h2 className="font-display text-2xl leading-tight mb-2">{listing.title}</h2>
          {listing.addressLine && (
            <div className="text-sm text-ink-900/60 mb-3 truncate">{listing.addressLine}</div>
          )}
          <div className="flex gap-5 text-sm text-ink-900/80 mb-3 flex-wrap">
            {listing.bedrooms != null && (
              <span className="flex items-center gap-1.5">
                <Bed className="w-4 h-4 text-ink-900/40" />
                <strong>{listing.bedrooms}</strong> bed
              </span>
            )}
            {listing.bathrooms != null && (
              <span className="flex items-center gap-1.5">
                <Bath className="w-4 h-4 text-ink-900/40" />
                <strong>{listing.bathrooms}</strong> bath
              </span>
            )}
            {listing.sqft != null && (
              <span className="flex items-center gap-1.5">
                <Maximize2 className="w-4 h-4 text-ink-900/40" />
                <strong>{listing.sqft.toLocaleString()}</strong> sqft
              </span>
            )}
          </div>

          {Object.keys(prices).length > 1 && (
            <div className="mb-3 p-2.5 rounded-xl bg-ink-50">
              <div className="text-[10px] uppercase tracking-wide text-ink-900/50 mb-1.5">
                Listed on {Object.keys(prices).length} sites
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {Object.entries(prices).map(([s, p]) => (
                  <span key={s} className="px-2 py-0.5 bg-white rounded border border-ink-100">
                    {s}: <strong>${p.toLocaleString()}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {listing.description && (
            <p className="text-sm text-ink-900/70 leading-relaxed line-clamp-5 mb-3">
              {listing.description}
            </p>
          )}

          {(listing.contactPhone || listing.contactEmail || listing.contactName) && (
            <div className="mb-3 p-3 rounded-xl bg-accent-yes/10 border border-accent-yes/30">
              <div className="text-[10px] uppercase tracking-wide text-accent-yes font-semibold mb-1.5">
                Contact
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-900">
                {listing.contactName && (
                  <span className="font-medium">{listing.contactName}</span>
                )}
                {listing.contactPhone && (
                  <a
                    href={`tel:${listing.contactPhone.replace(/\D/g, "")}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-ink-900 hover:underline"
                  >
                    📞 {listing.contactPhone}
                  </a>
                )}
                {listing.contactEmail && (
                  <a
                    href={`mailto:${listing.contactEmail}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-ink-900 hover:underline truncate"
                  >
                    ✉ {listing.contactEmail}
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-1.5 flex-wrap">
            {sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs px-2.5 py-1 bg-ink-100 hover:bg-ink-100/70 rounded-full inline-flex items-center gap-1"
              >
                {s.source}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

function ActionBar({
  onDecide,
  onHover,
  canUndo,
  onUndo,
  hoverDecision,
}: {
  onDecide: (d: Decision) => void;
  onHover: (d: Decision | null) => void;
  canUndo: boolean;
  onUndo: () => void;
  hoverDecision: Decision | null;
}) {
  return (
    <div className="absolute bottom-5 left-0 right-0 flex justify-center items-center gap-3 z-[120]">
      {canUndo && (
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => { (e.currentTarget as HTMLElement).blur(); onUndo(); }}
          title="Undo (⌘Z)"
          className="w-12 h-12 rounded-full bg-white border border-ink-100 text-ink-900/60 shadow-md hover:text-ink-900 flex items-center justify-center"
        >
          <RotateCcw className="w-5 h-5" />
        </motion.button>
      )}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        onMouseEnter={() => onHover("no")}
        onMouseLeave={() => onHover(null)}
        onClick={(e) => { (e.currentTarget as HTMLElement).blur(); onDecide("no"); }}
        title="Not interested (←)"
        className={
          "w-16 h-16 rounded-full bg-white border-2 border-accent-no text-accent-no shadow-lg flex items-center justify-center transition " +
          (hoverDecision === "no" ? "scale-110 shadow-xl" : "")
        }
      >
        <X className="w-7 h-7" strokeWidth={3} />
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        onMouseEnter={() => onHover("maybe")}
        onMouseLeave={() => onHover(null)}
        onClick={(e) => { (e.currentTarget as HTMLElement).blur(); onDecide("maybe"); }}
        title="Uncertain (↑)"
        className={
          "w-14 h-14 rounded-full bg-white border-2 border-accent-maybe text-amber-600 shadow-lg flex items-center justify-center transition " +
          (hoverDecision === "maybe" ? "scale-110 shadow-xl" : "")
        }
      >
        <HelpCircle className="w-6 h-6" strokeWidth={2.5} />
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        onMouseEnter={() => onHover("yes")}
        onMouseLeave={() => onHover(null)}
        onClick={(e) => { (e.currentTarget as HTMLElement).blur(); onDecide("yes"); }}
        title="Like it (→)"
        className={
          "w-16 h-16 rounded-full bg-white border-2 border-accent-yes text-accent-yes shadow-lg flex items-center justify-center transition " +
          (hoverDecision === "yes" ? "scale-110 shadow-xl" : "")
        }
      >
        <Check className="w-7 h-7" strokeWidth={3} />
      </motion.button>
    </div>
  );
}
