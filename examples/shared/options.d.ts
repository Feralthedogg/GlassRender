/** A switch of the surroundings. */
export interface EnvironmentChoice {
    readonly key: "inactive" | "tinted" | "reduceTransparency" | "increaseContrast" | "reduceMotion" | "buttonShapes";
    readonly label: string;
}

/** Settings of the surroundings, each one a switch in the panels. */
export declare const ENVIRONMENT: readonly EnvironmentChoice[];
