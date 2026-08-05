# Image-backed activity authoring

An image-backed activity references one approved raster background by opaque asset ID. Interactive fields are layered over it with normalized `x`, `y`, `width`, and `height` values in the inclusive 0–1 coordinate space. Geometry must be finite, positive, and wholly inside the background, so it remains stable across responsive preview sizes.

Supported fields are static label, single choice, text input, media trigger, and linked text panel. Each field has a stable UUID-backed ID. Choice options and scored text fields link to the separate Teacher solution by ID. Media triggers may reference only an allowed audio/video asset.

The Studio supports keyboard geometry adjustment, ordering, duplication, and removal. Approval requires a background, at least one valid field, accessible text where applicable, valid assets, and complete Teacher solutions for scored fields. Source rasters are read in place for preview; they are never copied or modified.
