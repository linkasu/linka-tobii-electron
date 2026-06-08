export interface PageElementsState {
  id: string;
  bounds: DOMRect[];
}

export interface BrowserElementsState extends PageElementsState {
  elements: Element[];
}

export type EyeTargetAction = "left" | "right" | "up" | "down" | "enter";

export type EyeTargetSettings = {
  timeout: number;
  enabled: boolean;
  eyeActivation: boolean;
  eyeSelect: boolean;
  keyboardActivation: boolean;
  joystickActivation: boolean;
};

export type EyeTargetKeyMapping = Partial<Record<EyeTargetAction, string[]>>;
