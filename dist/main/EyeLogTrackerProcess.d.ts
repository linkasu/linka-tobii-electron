import { TobiiProcess } from "eyelog/dist/TobiiProcess";
import { resolvePackageExtraResource } from "./resolvePackageExtraResource";
import type { EyeTrackerBound, EyeTrackerProcess } from "./EyeTrackerProcess";
export declare class EyeLogTrackerProcess extends TobiiProcess implements EyeTrackerProcess {
    constructor(resolveExtraResource?: typeof resolvePackageExtraResource);
    setBounds(bounds: EyeTrackerBound[]): void;
    destroy(): void;
}
