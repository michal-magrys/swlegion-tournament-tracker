export const FACTIONS: Record<string, string> = {
  rebellion: "Rebel Alliance",
  galactic_empire: "Galactic Empire",
  grand_army_republic: "Grand Army of the Republic",
  confederacy: "Confederacy of Independent Systems",
  shadow_collective: "Shadow Collective",
  echo_base: "Echo Base Defenders",
  bright_tree_village: "Bright Tree Village",
  blizzard_force: "Blizzard Force",
  imperial_remnant: "Imperial Remnant",
  tempest_force: "Tempest Force",
  stormtrooper_battalion: "Stormtrooper Battalion",
  "501st_legion": "501st Legion",
  "212th_attack_battalion": "212th Attack Battalion",
  wookiee_defenders: "Wookiee Defenders",
  experimental_droids: "Experimental Droids",
  separatist_invasion: "Separatist Invasion",
};

/** Primary factions shown in the UI dropdown */
export const PRIMARY_FACTIONS = [
  { code: "rebellion", name: "Rebel Alliance" },
  { code: "galactic_empire", name: "Galactic Empire" },
  { code: "grand_army_republic", name: "Grand Army of the Republic" },
  { code: "confederacy", name: "Confederacy of Independent Systems" },
  { code: "shadow_collective", name: "Shadow Collective" },
] as const;

export function factionCodeToName(code: string): string {
  return FACTIONS[code] ?? code;
}
