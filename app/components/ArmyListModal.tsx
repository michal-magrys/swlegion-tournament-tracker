"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { TopPlacement, ArmyList } from "@/lib/types";

interface ArmyListModalProps {
  placement: TopPlacement;
  list: ArmyList | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}

function ordinal(place: number): string {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  return "3rd";
}

export function ArmyListModal({
  placement,
  list,
  loading,
  error,
  onClose,
}: ArmyListModalProps) {
  // Keep a stable ref so the keydown effect never needs to re-register.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border border-gray-700 bg-[#0d0d14] p-6 shadow-xl mx-4 focus:outline-none"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 text-lg leading-none"
        >
          &times;
        </button>

        <h3 id="modal-title" className="text-yellow-400 font-semibold text-lg mb-1">
          {placement.player}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {ordinal(placement.place)} place &middot; {placement.faction}
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
            <svg
              className="animate-spin h-4 w-4 text-yellow-400"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading army list...
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm py-4 text-center">{error}</p>
        )}

        {list && (
          <div className="space-y-4 text-sm">
            <div className="flex gap-4 text-xs text-gray-400">
              <span>{list.points} pts</span>
              <span>{list.numActivations} activations</span>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Units
              </h4>
              <div className="space-y-1.5">
                {list.units.map((unit, index) => (
                  <div key={index} className="rounded bg-gray-800/50 px-3 py-2">
                    <div className="font-medium text-gray-200">
                      {unit.count > 1 && (
                        <span className="text-gray-400">{unit.count}&times; </span>
                      )}
                      {unit.name}
                    </div>
                    {unit.upgrades.length > 0 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {unit.upgrades.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Command Cards
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {list.commandCards.map((card, index) => (
                  <span
                    key={index}
                    className="rounded bg-gray-800/50 px-2 py-1 text-xs text-gray-300"
                  >
                    {card}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Battlefield Deck
              </h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-gray-500 mb-1">Objectives</div>
                  {list.battlefieldDeck.objective.map((objectiveCard, index) => (
                    <div key={index} className="text-gray-300">{objectiveCard}</div>
                  ))}
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Deployments</div>
                  {list.battlefieldDeck.deployment.map((deploymentCard, index) => (
                    <div key={index} className="text-gray-300">{deploymentCard}</div>
                  ))}
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Conditions</div>
                  {list.battlefieldDeck.conditions.map((conditionCard, index) => (
                    <div key={index} className="text-gray-300">{conditionCard}</div>
                  ))}
                </div>
              </div>
            </div>

            {list.listlink && (
              <div className="pt-2 border-t border-gray-800">
                <a
                  href={list.listlink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-yellow-400 hover:text-yellow-300"
                  aria-label="View on Tabletop Admiral (opens in new tab)"
                >
                  View on Tabletop Admiral &rarr;
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
