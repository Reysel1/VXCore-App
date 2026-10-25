export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const SPRING_PRESS = { type: "spring", stiffness: 620, damping: 32, mass: 0.6 } as const;

export const SPRING_SWAP = { type: "spring", stiffness: 420, damping: 30, mass: 0.7 } as const;

export const SPRING_LAYOUT = { type: "spring", stiffness: 320, damping: 34, mass: 0.9 } as const;

export const SPRING_MOUSE = { stiffness: 200, damping: 15, mass: 0.3 } as const;
