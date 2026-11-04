import { createContext } from "react";

// Export scenes render offscreen, independently of viewport preview suspension.
export const ExportPreviewContext = createContext<number | undefined>(
  undefined,
);
