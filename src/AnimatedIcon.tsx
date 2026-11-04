import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { ExportPreviewContext } from "./ExportPreviewContext";
import {
  enterIconMotion,
  playIconMotion,
  releaseIconMotion,
  setIconBusy,
} from "./iconMotion";
import { iconMotionFamilies } from "./iconMotionRecipes";
export type AnimatedIconProps = LucideProps & {
  motionBusy?: boolean;
  motionState?: string | number | boolean;
};
export function animatedIcon(name: string, Base: LucideIcon) {
  const Component = forwardRef<SVGSVGElement, AnimatedIconProps>(
    function AnimatedIcon(
      { motionBusy = false, motionState, children, ...props },
      forwarded,
    ) {
      const ref = useRef<SVGSVGElement>(null);
      const exporting = useContext(ExportPreviewContext) !== undefined;
      const previous = useRef(motionState);
      useImperativeHandle(forwarded, () => ref.current!, []);
      useLayoutEffect(() => {
        const svg = ref.current!;
        if (exporting) return;
        const frame = requestAnimationFrame(() => enterIconMotion(svg));
        return () => {
          cancelAnimationFrame(frame);
          releaseIconMotion(svg);
        };
      }, [exporting]);
      useEffect(() => {
        const svg = ref.current!;
        if (exporting) return;
        setIconBusy(svg, motionBusy);
        return () => releaseIconMotion(svg);
      }, [motionBusy, exporting]);
      useEffect(() => {
        if (
          previous.current !== motionState &&
          motionState !== false &&
          motionState !== undefined &&
          !exporting
        )
          playIconMotion(ref.current!, "click");
        previous.current = motionState;
      }, [motionState, exporting]);
      return (
        <Base
          {...props}
          ref={ref}
          aria-hidden={
            props["aria-hidden"] ??
            (!props["aria-label"] && !props["aria-labelledby"] && !props.role
              ? true
              : undefined)
          }
          className={`ui-icon ${props.className || ""}`}
          data-ui-icon={name}
          data-icon-family={iconMotionFamilies[name]}
          data-icon-static={exporting ? "" : undefined}
          data-icon-busy={motionBusy || undefined}
        >
          {children}
          {name === "Cloud" && (
            <circle
              data-icon-detail="sync-wave"
              cx="12"
              cy="12"
              r="7"
              opacity={0}
            />
          )}
          {name === "Thermometer" && (
            <path
              data-icon-detail="mercury"
              d="M12 18V9"
              fill="none"
              strokeWidth={2}
              opacity={0}
            />
          )}
        </Base>
      );
    },
  );
  Component.displayName = `Animated${name}`;
  return Component;
}
