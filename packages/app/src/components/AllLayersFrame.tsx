/**
 * The all-layers diagram, drawn into a sandboxed iframe. This file is the
 * only one lint lets set `srcDoc` (#2800): a new surface that draws a
 * diagram goes through `PreviewPane`, not another raw iframe.
 */
export function AllLayersFrame({ svg }: { svg: string }) {
  return (
    <iframe
      srcDoc={svg}
      sandbox="allow-same-origin"
      style={{ width: "100%", height: "100%", border: "none" }}
      title="Full diagram view"
    />
  );
}
