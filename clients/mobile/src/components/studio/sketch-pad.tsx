import { useEffect, useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, ScrollView, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { COLORS } from "@dodi/design-tokens";
import {
  appendPoint,
  SKETCH_COLORS,
  SKETCH_SIZE,
  SKETCH_WIDTHS,
  type SketchStroke,
  strokePath,
  undoStroke,
} from "@dodi/studio/sketch-strokes";
import { sketchPad } from "@dodi/ui-recipes";

import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface SketchPadLabels {
  color: string;
  thin: string;
  thick: string;
  eraser: string;
  undo: string;
  clear: string;
  canvas: string;
}

interface SketchPadProps {
  /** The committed strokes. Held by the caller so a drawing survives the pad unmounting. */
  strokes: SketchStroke[];
  onStrokesChange: (next: SketchStroke[]) => void;
  /** Fires on every committed change: a PNG data URL, or null once emptied. */
  onChange: (dataUrl: string | null) => void;
  labels: SketchPadLabels;
  /** The card's width in pt; the canvas is the game's 4:5 frame below the tool row. */
  width: number;
}

/** The white base under the drawing: the plan agent reads shapes, and a
 *  transparent PNG would reach it as black-on-black. Erasing paints it back. */
const PAPER = "#ffffff";

interface SvgExport {
  toDataURL(callback: (base64: string) => void, options?: object): void;
}

function ToolButton({
  icon,
  label,
  onPress,
  isActive = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive, disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className={cn(sketchPad.tool, isActive ? sketchPad.toolOn : sketchPad.toolOff, disabled && sketchPad.toolDisabled)}
    >
      <Icon name={icon} size={sketchPad.toolIcon.size} color={isActive ? "primary" : "muted-foreground"} />
    </Pressable>
  );
}

/**
 * Freehand sketch surface for the studio's Plan step (web: SketchPad): the
 * parent draws the screen they imagine and the plan agent reads the layout off
 * it. A white card with the tool row on top and the game's own 4:5 frame
 * below, drawn as SVG in the sketch's logical coordinates.
 */
export function SketchPad({ strokes, onStrokesChange, onChange, labels, width }: SketchPadProps) {
  const svgRef = useRef<SvgExport | null>(null);
  const [color, setColor] = useState<string>(SKETCH_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(SKETCH_WIDTHS.thin);
  const [isErasing, setIsErasing] = useState(false);
  // The stroke being drawn right now.
  const [live, setLive] = useState<SketchStroke | null>(null);
  const liveRef = useRef<SketchStroke | null>(null);
  // A committed change waits for the next render to be exported as a PNG.
  const isExportPendingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const canvasHeight = (width * SKETCH_SIZE.height) / SKETCH_SIZE.width;

  useEffect(() => {
    if (!isExportPendingRef.current) return;
    isExportPendingRef.current = false;
    if (strokes.length === 0) {
      onChangeRef.current(null);
      return;
    }
    svgRef.current?.toDataURL((base64) => onChangeRef.current(`data:image/png;base64,${base64}`), {
      width: SKETCH_SIZE.width,
      height: SKETCH_SIZE.height,
    });
  }, [strokes]);

  const commit = (next: SketchStroke[]): void => {
    isExportPendingRef.current = true;
    onStrokesChange(next);
  };

  const toLogical = (e: GestureResponderEvent): { x: number; y: number } => ({
    x: (e.nativeEvent.locationX / width) * SKETCH_SIZE.width,
    y: (e.nativeEvent.locationY / canvasHeight) * SKETCH_SIZE.height,
  });

  const start = (e: GestureResponderEvent): void => {
    const stroke: SketchStroke = {
      color,
      // An eraser needs to feel wider than the pen at the same setting.
      width: isErasing ? penWidth * 3 : penWidth,
      isEraser: isErasing,
      points: [toLogical(e)],
    };
    liveRef.current = stroke;
    setLive(stroke);
  };

  const move = (e: GestureResponderEvent): void => {
    const current = liveRef.current;
    if (!current) return;
    const next = appendPoint(current, toLogical(e));
    if (next === current) return;
    liveRef.current = next;
    setLive(next);
  };

  const end = (): void => {
    const current = liveRef.current;
    if (!current) return;
    liveRef.current = null;
    setLive(null);
    commit([...strokes, current]);
  };

  const drawn = live ? [...strokes, live] : strokes;
  const pens = [
    { value: SKETCH_WIDTHS.thin, label: labels.thin, dot: 5 },
    { value: SKETCH_WIDTHS.thick, label: labels.thick, dot: 11 },
  ];

  return (
    <View className={sketchPad.card} style={{ width }}>
      {/* Tool row: colors, pen sizes, then eraser / undo / clear at the end. */}
      <View style={{ height: sketchPad.toolbarHeight }} className={sketchPad.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-1"
          contentContainerClassName={cn(sketchPad.toolbarContent, "flex-grow")}
        >
          <View accessibilityLabel={labels.color} className={sketchPad.group}>
            {SKETCH_COLORS.map((swatch) => {
              const isSelected = !isErasing && color === swatch;
              return (
                <Pressable
                  key={swatch}
                  accessibilityRole="button"
                  accessibilityLabel={swatch}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    setColor(swatch);
                    setIsErasing(false);
                  }}
                  hitSlop={4}
                  className={sketchPad.swatchButton}
                >
                  <View className={isSelected ? sketchPad.swatchRing : sketchPad.swatchRingIdle}>
                    <View
                      className={cn(sketchPad.swatch, isSelected && sketchPad.swatchSelected)}
                      style={{ backgroundColor: swatch }}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View accessibilityLabel={labels.thin} className={sketchPad.group}>
            {pens.map((pen) => (
              <Pressable
                key={pen.value}
                accessibilityRole="button"
                accessibilityLabel={pen.label}
                accessibilityState={{ selected: penWidth === pen.value }}
                onPress={() => setPenWidth(pen.value)}
                hitSlop={4}
                className={cn(sketchPad.tool, penWidth === pen.value ? sketchPad.toolOn : sketchPad.toolOff)}
              >
                <View
                  className={sketchPad.penDot}
                  style={{
                    width: pen.dot,
                    height: pen.dot,
                    backgroundColor: isErasing ? COLORS.faint : color,
                  }}
                />
              </Pressable>
            ))}
          </View>

          <View className={sketchPad.groupEnd}>
            <ToolButton
              icon="eraser"
              label={labels.eraser}
              isActive={isErasing}
              onPress={() => setIsErasing((v) => !v)}
            />
            <ToolButton
              icon="undo"
              label={labels.undo}
              disabled={strokes.length === 0}
              onPress={() => commit(undoStroke(strokes))}
            />
            <ToolButton
              icon="delete"
              label={labels.clear}
              disabled={strokes.length === 0}
              onPress={() => commit([])}
            />
          </View>
        </ScrollView>
      </View>

      <View
        accessibilityLabel={labels.canvas}
        pointerEvents="box-only"
        className={sketchPad.canvas}
        style={{ height: canvasHeight }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={start}
        onResponderMove={move}
        onResponderRelease={end}
        onResponderTerminate={end}
      >
        <Svg
          ref={(node) => {
            svgRef.current = node as unknown as SvgExport | null;
          }}
          width={width}
          height={canvasHeight}
          viewBox={`0 0 ${SKETCH_SIZE.width} ${SKETCH_SIZE.height}`}
        >
          <Rect x={0} y={0} width={SKETCH_SIZE.width} height={SKETCH_SIZE.height} fill={PAPER} />
          {drawn.map((stroke, i) => (
            <Path
              key={i}
              d={strokePath(stroke)}
              stroke={stroke.isEraser ? PAPER : stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>
    </View>
  );
}
