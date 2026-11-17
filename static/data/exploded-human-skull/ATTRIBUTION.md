# Skull 3D Model Attribution & Provenance

- **Asset**: `human-skull-bp3d.glb` (22 articulated cranial and facial bones, hyoid bone, and 28 permanent teeth grouped by jaw quadrant)
- **Source Dataset**: **BodyParts3D 4.0**, © The Database Center for Life Science (DBCLS)
- **License**: **Creative Commons Attribution 4.0 International (CC BY 4.0)**
  - Official DBCLS License Notice: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (updated 2025-02-27)
  - Creative Commons Terms: https://creativecommons.org/licenses/by/4.0/
  - Publication: Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. *BodyParts3D: 3D structure database for anatomical concepts.* Nucleic Acids Research, 2009; 37(Database issue):D782-D785. https://doi.org/10.1093/nar/gkn613
- **Required Attribution**:
  > BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
- **Adaptations Applied**:
  - Extracted the 22 skull bones (`FMA46565` skeletal subset), the hyoid bone (`FJ3201`), and the 28 permanent teeth (`FJ1254`–`FJ1281`) from the BodyParts3D 4.0 web-optimized polygon distribution (`slorksmo/Human-Atlas` 0.2% meshoptimizer-simplified meters/Y-up adaptation).
  - Centered coordinates on the 22-bone skull proper bounding midpoint and scaled by `10.0` (`1 scene unit = 100 mm`) for WebGL viewport precision.
  - Grouped the 28 permanent teeth into `dentition-maxilla-left`, `dentition-maxilla-right`, and `dentition-mandible` child meshes attached to their supporting jaw bones.
  - Computed per-vertex `_SUTURE` proximity masks from inter-bone geometric distances across the 22 articulated skull bones so cranial and facial sutures can be visually emphasized or hidden without altering bone geometry.
