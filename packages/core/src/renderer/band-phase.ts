/**
 * The band phase of the routing chain (#3881), split out of `layout-edges.ts`:
 * `runRoutingChain` routes the canvas's own edges, then hands the ghost band's
 * edges to {@link routeBandEdges}.
 */
import type { LayoutNode, LayoutEdge, ContainerRect, LayoutOptions, Rect } from "./layout-types.js";
import { applyMutualPairs } from "./mutual-pair.js";
import { routeOrthogonalEdges } from "./edge-routing-channels.js";
import { routeGroupedEdges, fanOutGutterPorts } from "./edge-routing-groups.js";
import { distributeGutterLanes } from "./edge-routing-gutter-lanes.js";
import { framePieces } from "./frame-geometry.js";
import { ObstacleIndex, type ObstacleQuery } from "./obstacle-index.js";
import { GHOST_MARGIN } from "./layout-constants.js";
import { distributePorts } from "./edge-routing-ports.js";
import { distributeChannelLanes, LANE_PITCH, type ChannelLimits } from "./edge-routing-lanes.js";
import { seatPortsOnOutline, type PortResolver } from "./port-frame.js";
import {
  BAND_PHASE,
  clearHeldPorts,
  dropRoutesOnHeld,
  growAroundBandRoutes,
  isPeripheralEdge,
  keepBesideClear,
  liftOffBorders,
  sharesStretch,
  stepOffBoxes,
  type BandRouting,
} from "./band-routing.js";

/**
 * The second run of the chain (#3881): the ghost band's edges only, each pass
 * given the canvas's routed edges as fixed occupants (`BAND_PHASE`). The
 * band's frames join the obstacles here, with the per-endpoint exemption, so a
 * band edge does not cross a frame neither of its endpoints is in. Trunk
 * aggregation is left out: whether the band's lines share a spine is the hub
 * density question of #3804.
 */
export function routeBandEdges(
  nodes: Map<string, LayoutNode>,
  edges: LayoutEdge[],
  groupFrames: ContainerRect[],
  opts: {
    expandedFrames: Map<string, ContainerRect> | undefined;
    ports: PortResolver | undefined;
    band: BandRouting;
  },
  limits: ChannelLimits,
  grouped: boolean,
): void {
  const band = edges.filter((e) => BAND_PHASE.routes(e));
  if (band.length === 0) return;
  const { expandedFrames, ports } = opts;
  const occupants = edges.filter((e) => !isPeripheralEdge(e));
  const held = occupants.filter((e) => !BAND_PHASE.routes(e));
  // A frame title is a frame no node is in, so no band edge is exempt from it.
  const titles = opts.band.titles.map((r, i) => ({
    id: `title#${i}`,
    label: "",
    ghost: false,
    ...r,
  }));
  const obstacleIndex = ObstacleIndex.build(
    [...nodes.values()],
    [...groupFrames, ...opts.band.frames, ...titles],
    expandedFrames,
  );
  // A band edge leaves the focus frame, so its gutters run outside it and the
  // band: those frames are the content edge they are measured from.
  const outside: ContainerRect[] = [...groupFrames, ...opts.band.frames, ...opts.band.inner];
  const obstaclesFor = (edge: LayoutEdge): ObstacleQuery =>
    obstacleIndex.forEdge(edge.from, edge.to);
  distributePorts(nodes, band, ports);
  clearHeldPorts(nodes, band, held);
  routeOrthogonalEdges(nodes, band, obstaclesFor);
  dropRoutesOnHeld(band, held);
  routeGroupedEdges(
    nodes,
    occupants,
    outside,
    obstacleIndex,
    expandedFrames,
    grouped,
    limits,
    BAND_PHASE,
  );
  distributeGutterLanes(nodes, occupants, outside, limits, BAND_PHASE);
  fanOutGutterPorts(nodes, band, obstacleIndex, expandedFrames, ports);
  // A band frame bounds the channels next to it, as a card row does, and so does
  // the top and bottom border of each frame the band edges leave: a lane on a
  // border would read as the border.
  const borders = opts.band.inner.flatMap((c) => [
    { x: c.x, y: c.y - 1, width: c.width, height: 2 },
    { x: c.x, y: c.y + c.height - 1, width: c.width, height: 2 },
  ]);
  const channelFrames = [
    ...[...groupFrames, ...opts.band.frames].flatMap(framePieces),
    ...borders,
    ...opts.band.titles,
  ];
  distributeChannelLanes(nodes, occupants, channelFrames, limits, BAND_PHASE);
  if (ports) seatPortsOnOutline(nodes, band, ports, obstaclesFor);
  const pts = (e: LayoutEdge) => [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
  clearHeldPorts(
    nodes,
    band,
    held,
    (e) => obstaclesFor(e).polylineClear(pts(e)) && !sharesStretch(e, occupants),
  );
  liftOffBorders(
    band,
    [...opts.band.inner, ...opts.band.frames],
    LANE_PITCH,
    (e) => obstaclesFor(e).polylineClear(pts(e)) && !sharesStretch(e, occupants),
    occupants,
  );
  // The labels the canvas draws stay readable (#3889): a band run through one
  // steps a lane or more aside.
  stepOffBoxes(
    band,
    opts.band.labels(edges.filter((e) => e.band !== true)),
    [...opts.band.inner, ...opts.band.frames],
    LANE_PITCH,
    (e) => obstaclesFor(e).polylineClear(pts(e)) && !sharesStretch(e, occupants),
    nodes,
    occupants,
  );
  // A route that went round the band stays inside the frame that holds it.
  const before = opts.band.outer && { ...opts.band.outer };
  growAroundBandRoutes(opts.band.outer, band, GHOST_MARGIN);
  if (before) keepBesideClear(before, opts.band, nodes, edges);
}

/**
 * The boxes of the labels the canvas draws (#3889), for the band phase: the
 * canvas's routed edges are copied, their mutual pairs split as the canvas will
 * draw them (#3027), and the renderer's label pass is run on them. The band's
 * lines are not in that pass's obstacles (#2360), so these are the boxes the
 * final drawing has.
 */
export function canvasLabelsOf(
  nodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  options: LayoutOptions,
): (canvas: readonly LayoutEdge[]) => readonly Rect[] {
  const boxesOf = options.canvasLabelBoxes;
  if (!boxesOf) return () => [];
  return (canvas) => {
    const edges = canvas.map((e) => ({ ...e, waypoints: e.waypoints && [...e.waypoints] }));
    const crossingMarks = applyMutualPairs(edges, options);
    return boxesOf({ nodes, edges, containers, width: 0, height: 0, crossingMarks });
  };
}
