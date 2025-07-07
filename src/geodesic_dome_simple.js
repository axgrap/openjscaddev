const {
    primitives,
    transforms,
    maths,
    colors,
    text,
    extrusions,
    geometries,
    booleans,
    expansions,
} = jscadModeling;
const { cylinder, sphere, cuboid, polyhedron } = primitives;
const { translate, rotate, scale } = transforms;
const { vec3 } = maths;
const { colorize } = colors;
const { geom2, path2 } = geometries;

// TODO: Implement a way to make a dome by adding a sphere percentage parameter which sets the percent of the sphere above the z axis, by raising or lowering all of the vertices, slices off the vertices below 0, and adding vertices where the struts intersect with the 0 z axis.  There may need to be new hub logic introduced for these "base" hubs.  The base hubs could also be created not by percent but by face layer...
// TODO: Create a hub type where instead of a sheath there would be an extrusion that would be pushed into a hollow tube like pvc or conduit.


// Performance optimization and geometric constants
const CONSTANTS = {
    PHI: (1 + Math.sqrt(5)) / 2,
    R: 100,
    STRUT_SEGMENTS: 5, // Reduced from 16
    SPHERE_SEGMENTS: 6 // Reduced from default 24
};

// Canonical icosahedron vertices with clear labels and north pole on top
// Rotation angle to align N with +z
const theta = Math.atan(1 / CONSTANTS.PHI); // ≈ 31.7°
const cosTheta = Math.cos(theta);
const sinTheta = Math.sin(theta);

function rotateX(pos) {
    const [x, y, z] = pos;
    return [x, y * cosTheta - z * sinTheta, y * sinTheta + z * cosTheta];
}

const RAW_VERTICES = new Map([
    ["N", { pos: rotateX([0, 1, CONSTANTS.PHI]), label: "N" }],
    ["S", { pos: rotateX([0, -1, -CONSTANTS.PHI]), label: "S" }],
    ["A", { pos: rotateX([CONSTANTS.PHI, 0, 1]), label: "A" }],
    ["B", { pos: rotateX([-CONSTANTS.PHI, 0, 1]), label: "B" }],
    ["C", { pos: rotateX([CONSTANTS.PHI, 0, -1]), label: "C" }],
    ["D", { pos: rotateX([-CONSTANTS.PHI, 0, -1]), label: "D" }],
    ["E", { pos: rotateX([1, CONSTANTS.PHI, 0]), label: "E" }],
    ["F", { pos: rotateX([-1, CONSTANTS.PHI, 0]), label: "F" }],
    ["G", { pos: rotateX([1, -CONSTANTS.PHI, 0]), label: "G" }],
    ["H", { pos: rotateX([-1, -CONSTANTS.PHI, 0]), label: "H" }],
    ["I", { pos: rotateX([0, -1, CONSTANTS.PHI]), label: "I" }],
    ["J", { pos: rotateX([0, 1, -CONSTANTS.PHI]), label: "J" }],
]);

// Canonical icosahedron faces using the above labels
const ICOSAHEDRON_FACE_LABELS = [
    ["N", "E", "A"],
    ["N", "I", "B"],
    ["N", "B", "F"],
    ["C", "A", "E"],
    ["A", "C", "G"],
    ["N", "F", "E"],
    ["N", "A", "I"],
    ["A", "G", "I"],
    ["I", "H", "B"],
    ["B", "H", "D"],
    ["B", "D", "F"],
    ["F", "D", "J"],
    ["J", "D", "S"],
    ["F", "J", "E"],
    ["J", "C", "E"],
    ["J", "S", "C"],
    ["S", "D", "H"],
    ["G", "S", "H"],
    ["C", "S", "G"],
    ["G", "H", "I"],
];

// Measurement system helpers
const MEASUREMENT_SYSTEMS = {
    IMPERIAL: "imperial",
    METRIC: "metric",
};

const UNIT_CONVERSIONS = {
    [MEASUREMENT_SYSTEMS.IMPERIAL]: {
        // Base unit: inches
        feet: 12,
        inches: 1,
        mm: 1 / 25.4,
        cm: 1 / 2.54,
        m: 39.3701,
    },
    [MEASUREMENT_SYSTEMS.METRIC]: {
        // Base unit: mm
        feet: 304.8,
        inches: 25.4,
        mm: 1,
        cm: 10,
        m: 1000,
    },
};

const MeasurementUtils = {
    convertToBaseUnit(value, fromUnit, system) {
        const conversions = UNIT_CONVERSIONS[system];
        return value * conversions[fromUnit];
    },
    convertFromBaseUnit(value, toUnit, system) {
        const conversions = UNIT_CONVERSIONS[system];
        return value / conversions[toUnit];
    },
    formatMeasurement(value, unit, system) {
        if (system === MEASUREMENT_SYSTEMS.IMPERIAL && unit === "feet") {
            const feet = Math.floor(value);
            const inches = Math.round((value - feet) * 12);
            if (inches === 0) return `${feet}'`;
            return `${feet}' ${inches}"`;
        }
        return `${value.toFixed(2)} ${unit}`;
    },
};

const ColorUtils = {
    lastColor: null,
    getNextColor() {
        let newColor;
        let attempts = 0;
        const maxAttempts = 50;
        do {
            // Generate random HSL values
            const hue = Math.random() * 360;
            const saturation = 0.6 + Math.random() * 0.4; // 60-100% saturation for vibrant colors
            const lightness = 0.4 + Math.random() * 0.3; // 40-70% lightness for good visibility
            // Convert HSL to RGB
            const h = hue / 60;
            const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
            const x = c * (1 - Math.abs((h % 2) - 1));
            const m = lightness - c / 2;
            let r, g, b;
            if (h < 1) {
                [r, g, b] = [c, x, 0];
            } else if (h < 2) {
                [r, g, b] = [x, c, 0];
            } else if (h < 3) {
                [r, g, b] = [0, c, x];
            } else if (h < 4) {
                [r, g, b] = [0, x, c];
            } else if (h < 5) {
                [r, g, b] = [x, 0, c];
            } else {
                [r, g, b] = [c, 0, x];
            }
            newColor = [r + m, g + m, b + m];
            attempts++;
            // Check if this color is sufficiently different from the last color
            if (this.lastColor === null) {
                break; // First color, accept it
            }
            // Calculate color difference using Euclidean distance in RGB space
            const dr = newColor[0] - this.lastColor[0];
            const dg = newColor[1] - this.lastColor[1];
            const db = newColor[2] - this.lastColor[2];
            const distance = Math.sqrt(dr * dr + dg * dg + db * db);
            // Accept if distance is greater than threshold (0.3 is a good threshold)
            if (distance > 0.3) {
                break;
            }
        } while (attempts < maxAttempts);
        this.lastColor = newColor;
        return newColor;
    },
};

const HubUtils = {
    makePolyHub(
        faces,
        vertex,
        expansion = 3,
        strutStore,
        sheathScale = 1.25,
        sheathLengthPercent = 0.2
    ) {
        // Use faces.getEdges() to find all edges connected to this vertex
        const connected = faces
            .getEdges()
            .filter(
                (edge) => vec3.equals(edge[0], vertex) || vec3.equals(edge[1], vertex)
            )
            .map((edge) => (vec3.equals(edge[0], vertex) ? edge[1] : edge[0]))
            .filter(
                (pt, idx, arr) => arr.findIndex((other) => vec3.equals(pt, other)) === idx
            );
        // Compute base points along each edge
        let basePoints = connected.map((other) => [
            vertex[0] + 0.05 * (other[0] - vertex[0]),
            vertex[1] + 0.05 * (other[1] - vertex[1]),
            vertex[2] + 0.05 * (other[2] - vertex[2]),
        ]);
        // Sort basePoints in clockwise order around the vertex
        if (basePoints.length > 2) {
            // Find a local tangent plane at the vertex
            const normal = vec3.normalize(vec3.create(), vertex);
            // Pick a reference direction (first basePoint - vertex)
            const ref = [
                basePoints[0][0] - vertex[0],
                basePoints[0][1] - vertex[1],
                basePoints[0][2] - vertex[2],
            ];
            // Find a tangent vector (perpendicular to normal)
            let tangent = vec3.cross(vec3.create(), normal, ref);
            if (vec3.length(tangent) < 1e-8) {
                // If ref is parallel to normal, pick another
                tangent = vec3.cross(vec3.create(), normal, [1, 0, 0]);
                if (vec3.length(tangent) < 1e-8) tangent = vec3.cross(vec3.create(), normal, [0, 1, 0]);
            }
            vec3.normalize(tangent, tangent);
            // Second tangent (binormal)
            const binormal = vec3.cross(vec3.create(), normal, tangent);
            // Project each basePoint to 2D in the tangent plane
            const angles = basePoints.map((pt) => {
                const v = [pt[0] - vertex[0], pt[1] - vertex[1], pt[2] - vertex[2]];
                const x = vec3.dot(v, tangent);
                const y = vec3.dot(v, binormal);
                return Math.atan2(y, x);
            });
            // Sort basePoints by angle
            basePoints = basePoints
                .map((pt, i) => ({ pt, angle: angles[i] }))
                .sort((a, b) => a.angle - b.angle)
                .map((obj) => obj.pt);
        }
        // Polyhedron points: vertex first, then all base points
        const points = [vertex, ...basePoints];
        // Faces: triangles [vertex, base_i, base_{i+1}]
        let facesArr = [];
        for (let i = 0; i < basePoints.length; i++) {
            facesArr.push([0, 1 + i, 1 + ((i + 1) % basePoints.length)]);
        }
        //Put the inner face at the end of the faces array
        facesArr = [
            ...facesArr,
            Array.from({ length: basePoints.length }, (v, k) => k + 1).reverse(),
        ];
        // Create the polyhedron
        let hub = primitives.polyhedron({
            points,
            faces: facesArr,
            orientation: "outward",
        });
        // Expand the polyhedron outward
        hub = expansions.expand({ delta: expansion, segments: CONSTANTS.SPHERE_SEGMENTS }, hub);

        // Add sheaths for each strut
        for (const other of connected) {
            const strutInfo = strutStore.getStrutByEndpoints(vertex, other);
            if (strutInfo) {
                // Compute direction and length for sheath
                const dir = [
                    other[0] - vertex[0],
                    other[1] - vertex[1],
                    other[2] - vertex[2],
                ];
                const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
                const norm = [dir[0] / len, dir[1] / len, dir[2] / len];
                // Sheath parameters
                const sheathLength = len * (sheathLengthPercent * 0.01);
                const sheathStart = [
                    vertex[0] - norm[0] * expansion * 0.5,
                    vertex[1] - norm[1] * expansion * 0.5,
                    vertex[2] - norm[2] * expansion * 0.5,
                ];
                const sheathEnd = [
                    vertex[0] + norm[0] * sheathLength,
                    vertex[1] + norm[1] * sheathLength,
                    vertex[2] + norm[2] * sheathLength,
                ];
                let sheath;
                if (strutInfo.strutType === "rectangular") {
                    sheath = cuboidFromTo(
                        sheathStart,
                        sheathEnd,
                        strutInfo.width * sheathScale,
                        strutInfo.height * sheathScale,
                        0,
                        0
                    );
                } else {
                    // For cylindrical/linear, use height as radius
                    const sheathRadius = (strutInfo.height || 2) * sheathScale;
                    sheath = cylinderFromTo(
                        sheathStart,
                        sheathEnd,
                        sheathRadius,
                        16,
                        0
                    );
                }
                hub = booleans.union(hub, sheath);
                const cutter = strutStore.getStrutByEndpoints(vertex, other);
                hub = booleans.subtract(hub, cutter.strut);
            }
        }
        return hub;
    },
};

// Hub class to store generated hubs and provide helpers
class Hub {
    constructor() {
        this.hubs = [];
    }
    addHub(hubObj, vertex) {
        this.hubs.push({ hub: hubObj, vertex });
    }
    getHubs() {
        return this.hubs.map((h) => h.hub);
    }
    getHubByVertex(vertex) {
        // Returns the hub object for a given vertex (using vec3.equals)
        return this.hubs.find((h) => vec3.equals(h.vertex, vertex))?.hub;
    }
    getVertices() {
        // Returns all vertices for which hubs exist
        return this.hubs.map((h) => h.vertex);
    }
    count() {
        return this.hubs.length;
    }
    getRelativeAngles(vertex, faces) {
        // Returns the angles (in radians) between all connected struts at this hub
        // faces: Faces instance, needed to get connected vertices
        const hubEntry = this.hubs.find((h) => vec3.equals(h.vertex, vertex));
        if (!hubEntry) return [];
        const connected = faces
            .getEdges()
            .filter(
                (edge) => vec3.equals(edge[0], vertex) || vec3.equals(edge[1], vertex)
            )
            .map((edge) => (vec3.equals(edge[0], vertex) ? edge[1] : edge[0]))
            .filter(
                (pt, idx, arr) => arr.findIndex((other) => vec3.equals(pt, other)) === idx
            );
        // Compute angles between all pairs of struts
        const angles = [];
        for (let i = 0; i < connected.length; i++) {
            for (let j = i + 1; j < connected.length; j++) {
                const v1 = connected[i];
                const v2 = connected[j];
                const dir1 = [v1[0] - vertex[0], v1[1] - vertex[1], v1[2] - vertex[2]];
                const dir2 = [v2[0] - vertex[0], v2[1] - vertex[1], v2[2] - vertex[2]];
                const dot = vec3.dot(dir1, dir2);
                const len1 = vec3.length(dir1);
                const len2 = vec3.length(dir2);
                const angle = Math.acos(dot / (len1 * len2));
                angles.push(angle);
            }
        }
        return angles;
    }
    getHubType(vertex, faces) {
        // Returns a string describing the hub type based on number of connections
        const connected = faces
            .getEdges()
            .filter(
                (edge) => vec3.equals(edge[0], vertex) || vec3.equals(edge[1], vertex)
            )
            .map((edge) => (vec3.equals(edge[0], vertex) ? edge[1] : edge[0]))
            .filter(
                (pt, idx, arr) => arr.findIndex((other) => vec3.equals(pt, other)) === idx
            );
        const count = connected.length;
        if (count === 5) return "pentagon";
        if (count === 6) return "hexagon";
        return `valence-${count}`;
    }
    rotateHub(vertex, rotationMatrix) {
        // Rotates the hub at the given vertex by the provided rotation matrix
        const hubEntry = this.hubs.find((h) => vec3.equals(h.vertex, vertex));
        if (!hubEntry) return;
        hubEntry.hub = transforms.transform(rotationMatrix, hubEntry.hub);
        hubEntry.vertex = vec3.transformMat4(vec3.create(), hubEntry.vertex, rotationMatrix);
    }
    moveHub(vertex, translationVec) {
        // Moves the hub at the given vertex by the provided translation vector
        const hubEntry = this.hubs.find((h) => vec3.equals(h.vertex, vertex));
        if (!hubEntry) return;
        hubEntry.hub = transforms.translate(translationVec, hubEntry.hub);
        hubEntry.vertex = [
            hubEntry.vertex[0] + translationVec[0],
            hubEntry.vertex[1] + translationVec[1],
            hubEntry.vertex[2] + translationVec[2],
        ];
    }
}

// Strut class to store generated struts and provide helpers
class Strut {
    constructor() {
        this.struts = [];
    }
    addStrut(strutObj, v1, v2, strutType, width, height) {
        this.struts.push({ strut: strutObj, v1, v2, strutType, width, height });
    }
    getStruts() {
        return this.struts.map((s) => s.strut);
    }
    getStrutByEndpoints(v1, v2) {
        // Returns the strut object for a given pair of endpoints (order-insensitive)
        return this.struts.find(
            (s) =>
                (vec3.equals(s.v1, v1) && vec3.equals(s.v2, v2)) ||
                (vec3.equals(s.v1, v2) && vec3.equals(s.v2, v1))
        );
    }
    count() {
        return this.struts.length;
    }
    getLengths() {
        // Returns an array of all strut lengths
        return this.struts.map((s) => {
            const dx = s.v2[0] - s.v1[0];
            const dy = s.v2[1] - s.v1[1];
            const dz = s.v2[2] - s.v1[2];
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        });
    }
    getTypes(epsilon = 1e-5) {
        // Returns a map of unique strut lengths (rounded to epsilon) and their counts
        const lengths = this.getLengths();
        const typeMap = new Map();
        for (const len of lengths) {
            // Round to nearest epsilon
            const rounded = Math.round(len / epsilon) * epsilon;
            typeMap.set(rounded, (typeMap.get(rounded) || 0) + 1);
        }
        return typeMap;
    }
}

// DomeStructure class to house hubs, struts, and faces
class DomeStructure {
    constructor({ faces = null, hubs = null, struts = null } = {}) {
        this.faces = faces || null;
        this.hubs = hubs || new Hub();
        this.struts = struts || new Strut();
    }
    getHubs() {
        return this.hubs;
    }
    getStruts() {
        return this.struts;
    }
    getFaces() {
        return this.faces;
    }
    setFaces(faces) {
        this.faces = faces;
    }
    setHubs(hubs) {
        this.hubs = hubs;
    }
    setStruts(struts) {
        this.struts = struts;
    }
    getHubTypes() {
        // Returns a map of hub types and their counts
        const types = new Map();
        const faces = this.getFaces();
        for (const vertex of this.hubs.getVertices()) {
            const type = this.hubs.getHubType(vertex, faces);
            types.set(type, (types.get(type) || 0) + 1);
        }
        return types;
    }
    getStrutTypes(epsilon = 1e-5) {
        // Returns a map of strut types (lengths) and their counts
        return this.struts.getTypes(epsilon);
    }
    getAllRelativeAngles() {
        // Returns a map of vertex to array of relative angles
        const faces = this.getFaces();
        const angleMap = new Map();
        for (const vertex of this.hubs.getVertices()) {
            angleMap.set(vertex, this.hubs.getRelativeAngles(vertex, faces));
        }
        return angleMap;
    }
    transformAllHubs(fn) {
        // Applies a transformation function to all hubs (fn: (hubObj, vertex) => { hub, vertex })
        for (const h of this.hubs.hubs) {
            const result = fn(h.hub, h.vertex);
            if (result && result.hub && result.vertex) {
                h.hub = result.hub;
                h.vertex = result.vertex;
            }
        }
    }
    transformAllStruts(fn) {
        // Applies a transformation function to all struts (fn: (strutObj, v1, v2) => { strut, v1, v2 })
        for (const s of this.struts.struts) {
            const result = fn(s.strut, s.v1, s.v2);
            if (result && result.strut && result.v1 && result.v2) {
                s.strut = result.strut;
                s.v1 = result.v1;
                s.v2 = result.v2;
            }
        }
    }
}

export function getParameterDefinitions() {
    // Toggles for major components
    const toggles = [
        {
            name: "showFaces",
            type: "checkbox",
            checked: false,
            caption: "Show Faces",
        },
        {
            name: "showStruts",
            type: "checkbox",
            checked: false,
            caption: "Show Struts",
        },
        {
            name: "showHubs",
            type: "checkbox",
            checked: true,
            caption: "Show Hubs",
        },
    ];

    // Functional parameters (affect dome geometry and construction)
    const functionalParams = [
        {
            name: "strutPercent",
            type: "number",
            initial: 0.1,
            min: 0.1,
            max: 0.5,
            step: 0.01,
            caption: "Strut Percent",
            visible: (params) => params.showStruts !== false,
        },
        {
            name: "measurementSystem",
            type: "choice",
            caption: "Measurement System",
            values: [MEASUREMENT_SYSTEMS.IMPERIAL, MEASUREMENT_SYSTEMS.METRIC],
            initial: MEASUREMENT_SYSTEMS.IMPERIAL,
        },
        {
            name: "hubExpansion",
            type: "number",
            initial: 3,
            min: 0,
            max: 10,
            step: 0.1,
            caption: "Hub Expansion",
            visible: (params) => params.showHubs !== false,
        },
        {
            name: "strutType",
            type: "choice",
            caption: "Strut Type",
            values: ["rectangular", "cylindrical", "linear"],
            initial: "cylindrical",
            visible: (params) => params.showStruts !== false || params.showHubs !== false,
        },
        {
            name: "frequency",
            type: "number",
            initial: 1,
            min: 1,
            max: 3,
            step: 1,
            caption: "Frequency",
        },
        {
            name: "strutHeight",
            type: "number",
            initial: 2,
            min: 0.1,
            max: 10,
            step: 0.1,
            caption: "Strut Height (inches/mm)",
            visible: (params) => params.showStruts !== false || params.showHubs !== false,
        },
        {
            name: "strutWidth",
            type: "number",
            initial: 4,
            min: 0.1,
            max: 10,
            step: 0.1,
            caption: "Strut Width (inches/mm)",
            visible: (params) => params.showStruts !== false || params.showHubs !== false,
        },
        {
            name: "sphereRadius",
            type: "number",
            initial: 2,
            min: 0.1,
            max: 10,
            step: 0.1,
            caption: "Sphere Radius (inches/mm)",
        },
        {
            name: "domeSize",
            type: "number",
            initial: 100,
            min: 1,
            max: 300,
            step: 1,
            caption: "Dome Size (inches/mm)",
        },
        {
            name: "sheathScale",
            type: "number",
            initial: 1.25,
            min: 1.0,
            max: 2.0,
            step: 0.01,
            caption: "Sheath Scale",
            visible: (params) => params.showHubs !== false,
        },
        {
            name: "sheathLengthPercent",
            type: "number",
            initial: 10,
            min: 1,
            max: 100,
            step: 1,
            caption: "Sheath Length Percent",
            visible: (params) => params.showHubs !== false,
        },
    ];

    // Debugging/visualization parameters
    const debugParams = [
        {
            name: "debugStep",
            type: "number",
            initial: 12,
            min: 0,
            max: 12,
            step: 1,
            caption: "Debug Step",
            visible: (params) => params.showStruts !== false,
        },
        {
            name: "showVertexLabels",
            type: "checkbox",
            checked: true,
            caption: "Show Vertex Labels (Debug)",
        },
    ];

    // Combine and return
    return [...toggles, ...functionalParams, ...debugParams];
}

export function main(params) {
    console.log("=== Geodesic Dome Simple - Main Function Start ===");
    console.log("Parameters:", params);

    const {
        measurementSystem,
        frequency,
        strutHeight,
        strutWidth,
        sphereRadius,
        domeSize,
        strutType,
        debugStep,
        showVertexLabels,
        hubExpansion,
        strutPercent,
        sheathScale,
        sheathLengthPercent,
        showFaces,
        showStruts,
        showHubs,
    } = params;

    // Convert measurements to base units (inches for imperial, mm for metric)
    const baseUnit = measurementSystem === MEASUREMENT_SYSTEMS.IMPERIAL ? "inches" : "mm";
    const scaledStrutHeight = MeasurementUtils.convertToBaseUnit(
        strutHeight,
        baseUnit,
        measurementSystem
    );
    const scaledStrutWidth = MeasurementUtils.convertToBaseUnit(
        strutWidth,
        baseUnit,
        measurementSystem
    );
    const scaledSphereRadius = MeasurementUtils.convertToBaseUnit(
        sphereRadius,
        baseUnit,
        measurementSystem
    );
    const scaledDomeSize = MeasurementUtils.convertToBaseUnit(
        domeSize,
        baseUnit,
        measurementSystem
    );

    // Scale the base radius by dome size
    const baseRadius = scaledDomeSize;

    console.log(`[SimpleDome] Measurement System: ${measurementSystem}`);
    console.log(
        `[SimpleDome] Base radius: ${MeasurementUtils.formatMeasurement(
            baseRadius,
            baseUnit,
            measurementSystem
        )}`
    );
    console.log(
        `[SimpleDome] Strut height: ${MeasurementUtils.formatMeasurement(
            scaledStrutHeight,
            baseUnit,
            measurementSystem
        )}`
    );
    console.log(
        `[SimpleDome] Strut width: ${MeasurementUtils.formatMeasurement(
            scaledStrutWidth,
            baseUnit,
            measurementSystem
        )}`
    );
    console.log(
        `[SimpleDome] Sphere radius: ${MeasurementUtils.formatMeasurement(
            scaledSphereRadius,
            baseUnit,
            measurementSystem
        )}`
    );

    // Generate faces based on frequency
    const faces = generateGeodesicFaces(frequency, baseRadius);

    const shrinkPercent = calculateGlobalStrutShrinkPercent(
        faces,           // your Faces object
        strutType,       // 'cylindrical' or 'rectangular'
        scaledStrutHeight, // for cylindrical: radius
        scaledStrutWidth,  // for rectangular: width
        scaledStrutHeight  // for rectangular: height
        // optional: typicalStrutLength (otherwise uses minimum found)
    )

    // Create struts and store them
    const { objects: strutObjects, strutStore } = createStruts(
        faces.getEdges(),
        scaledStrutHeight,
        scaledStrutWidth,
        strutType,
        shrinkPercent,
        debugStep
    );

    // Create and store hubs
    const hubStore = new Hub();
    // Generate a hub for every vertex
    for (const vertex of faces.getVertices()) {
        const polyHub = HubUtils.makePolyHub(
            faces,
            vertex,
            hubExpansion,
            strutStore,
            sheathScale,
            sheathLengthPercent
        );
        hubStore.addHub(polyHub, vertex);
    }

    // Create the parent structure
    const dome = new DomeStructure({ faces, hubs: hubStore, struts: strutStore });



    const objects = [];
    if (showVertexLabels) {
        const labelObjects = RAW_VERTICES.entries().map(([key, val]) => {
            return createVerticeText(key, val.pos, baseRadius);
        });
        objects.push(...labelObjects);
    }
    // Add struts
    if (showStruts !== false) {
        objects.push(...strutObjects);
    }
    // Add faces
    if (showFaces !== false) {
        const faceObjects = createFaces(faces.getTriangles());
        objects.push(...faceObjects);
    }
    // Add hubs
    if (showHubs !== false) {
        objects.push(...hubStore.getHubs());
    }

    console.log(`[SimpleDome] Created ${objects.length} objects.`);
    return objects;
}

// Helper to get array of vertex objects (for index-based access)
function getRawVerticesArray() {
    return Array.from(RAW_VERTICES.values());
}

function generateIcosahedronFaces() {
    // Returns a Map: key = 'label1,label2,label3', value = [vertexObj1, vertexObj2, vertexObj3]
    const faceMap = new Map();
    for (const labels of ICOSAHEDRON_FACE_LABELS) {
        const verts = labels.map((label) => RAW_VERTICES.get(label));
        faceMap.set(labels.join(","), verts);
    }
    return faceMap;
}

const RAW_FACES = generateIcosahedronFaces();

function cuboidFromTo(p1, p2, width, height, shrink = 0, debugStep = 0) {
    // TODO come back to this.  Strut is not being aligned to face the center correctlty.

    try {
        const sqr = (x) => x * x;
        let dx = p2[0] - p1[0];
        let dy = p2[1] - p1[1];
        let dz = p2[2] - p1[2];
        let length = Math.sqrt(sqr(dx) + sqr(dy) + sqr(dz));

        // Step 0: Show original cuboid at origin
        let obj = cuboid({
            size: [width, height, length],
            center: [0, 0, 0],
        });
        if (debugStep == 0) {
            return obj;
        }

        // Step 1: Show cuboid after shrink calculation (if any)
        if (shrink > 0 && length > 2 * shrink) {
            const ux = dx / length,
                uy = dy / length,
                uz = dz / length;
            p1 = [p1[0] + ux * shrink, p1[1] + uy * shrink, p1[2] + uz * shrink];
            p2 = [p2[0] - ux * shrink, p2[1] - uy * shrink, p2[2] - uz * shrink];
            dx = p2[0] - p1[0];
            dy = p2[1] - p1[1];
            dz = p2[2] - p1[2];
            length = Math.sqrt(sqr(dx) + sqr(dy) + sqr(dz));
        }
        if (debugStep == 1) {
            return obj;
        }

        // Step 2: Calculate direction vector
        const direction = [dx / length, dy / length, dz / length];
        if (debugStep == 2) {
            return obj;
        }

        // Step 3: First rotation - align Z-axis with edge direction
        const zAxis = [0, 0, 1];
        const rotationAxis = maths.vec3.cross(
            maths.vec3.create(),
            zAxis,
            direction
        );
        const rotationAngle = Math.acos(maths.vec3.dot(zAxis, direction));

        if (rotationAngle > 1e-6) {
            const rotationMatrix = maths.mat4.fromRotation(
                maths.mat4.create(),
                rotationAngle,
                rotationAxis
            );
            obj = transforms.transform(rotationMatrix, obj);
        }
        if (debugStep == 3) {
            return obj;
        }

        // Step 4: Calculate midpoint
        const midpoint = [p1[0] + dx / 2, p1[1] + dy / 2, p1[2] + dz / 2];
        if (debugStep == 4) {
            return obj;
        }

        // Step 5: Calculate to-center vector
        const toCenter = [-midpoint[0], -midpoint[1], -midpoint[2]];
        const toCenterLength = Math.sqrt(
            sqr(toCenter[0]) + sqr(toCenter[1]) + sqr(toCenter[2])
        );
        if (debugStep == 5) {
            return obj;
        }

        // Step 6: Normalize to-center vector
        if (toCenterLength > 1e-6) {
            toCenter[0] /= toCenterLength;
            toCenter[1] /= toCenterLength;
            toCenter[2] /= toCenterLength;
        }
        if (debugStep == 6) {
            return obj;
        }

        // Step 7: Calculate current X-axis after first rotation
        const currentXAxis = maths.vec3.cross(
            maths.vec3.create(),
            direction,
            [0, 1, 0]
        );
        const currentXLength = maths.vec3.length(currentXAxis);
        if (debugStep == 7) {
            return obj;
        }

        // Step 8: Normalize current X-axis
        if (currentXLength > 1e-6) {
            maths.vec3.normalize(currentXAxis, currentXAxis);
        }
        if (debugStep == 8) {
            return obj;
        }

        // Step 9: Project to-center onto plane perpendicular to direction
        const projectedToCenter = maths.vec3.subtract(
            maths.vec3.create(),
            toCenter,
            maths.vec3.scale(
                maths.vec3.create(),
                direction,
                maths.vec3.dot(toCenter, direction)
            )
        );
        maths.vec3.normalize(projectedToCenter, projectedToCenter);
        if (debugStep == 9) {
            return obj;
        }

        // Step 10: Calculate alignment angle and apply second rotation
        if (currentXLength > 1e-6) {
            const dotProduct = maths.vec3.dot(currentXAxis, projectedToCenter);
            const crossProduct = maths.vec3.cross(
                maths.vec3.create(),
                currentXAxis,
                projectedToCenter
            );
            const alignmentAngle = Math.atan2(
                maths.vec3.dot(crossProduct, direction),
                dotProduct
            );

            // Apply the rotation around the edge direction
            const alignmentMatrix = maths.mat4.fromRotation(
                maths.mat4.create(),
                alignmentAngle,
                direction
            );
            obj = transforms.transform(alignmentMatrix, obj);
        }
        if (debugStep == 10) {
            return obj;
        }

        // Step 11: Move halfway to final position
        const halfwayPoint = [midpoint[0] / 2, midpoint[1] / 2, midpoint[2] / 2];
        obj = translate(halfwayPoint, obj);
        if (debugStep == 11) {
            return obj;
        }

        // Step 12: Final translation to midpoint
        obj = translate(halfwayPoint, obj); // Move the rest of the way
        return obj;
    } catch (e) {
        console.error("Error in cuboidFromTo: ", e);
        return null;
    }
}

function cylinderFromTo(p1, p2, radius, segments, shrink = 0) {
    const sqr = (x) => x * x;
    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];
    let dz = p2[2] - p1[2];
    let height = Math.sqrt(sqr(dx) + sqr(dy) + sqr(dz));
    // Interpret shrink as a percentage (0-1) of the total length to remove
    if (shrink > 0 && shrink < 1 && height > 1e-8) {
        const shrinkAmount = height * shrink * 0.5; // remove shrink% of length, split at both ends
        const ux = dx / height,
            uy = dy / height,
            uz = dz / height;
        p1 = [p1[0] + ux * shrinkAmount, p1[1] + uy * shrinkAmount, p1[2] + uz * shrinkAmount];
        p2 = [p2[0] - ux * shrinkAmount, p2[1] - uy * shrinkAmount, p2[2] - uz * shrinkAmount];
        dx = p2[0] - p1[0];
        dy = p2[1] - p1[1];
        dz = p2[2] - p1[2];
        height = Math.sqrt(sqr(dx) + sqr(dy) + sqr(dz));
    }
    let obj = cylinder({
        height: height,
        radius: radius,
        segments: segments,
    });
    if (dx || dy) {
        let dxy = Math.sqrt(sqr(dx) + sqr(dy));
        let ay = Math.atan(dxy / dz) * (dx < 0 ? -1 : 1);
        let az = Math.atan(dy / dx);
        let ax = dz < 0 ? -Math.PI : 0;
        obj = transforms.rotate([ax, ay, az], obj);
    }
    let mid = [p1[0] + dx / 2, p1[1] + dy / 2, p1[2] + dz / 2];
    return translate(mid, obj);
}

// Helper functions for vertex structure
function getVertexPosition(vertex) {
    return Array.isArray(vertex) ? vertex : vertex.pos;
}

function getVertexLabel(vertex, index) {
    if (Array.isArray(vertex)) {
        return `v${index}`;
    }
    return vertex.label || `v${index}`;
}

// Normalize so all vertices are on the sphere of given radius
function normalize([x, y, z], radius) {
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-8) {
        // Avoid division by zero, return origin (or skip in caller)
        return [0, 0, 0];
    }
    return [(x * radius) / len, (y * radius) / len, (z * radius) / len];
}

// Faces class to hold triangles and provide helpers
class Faces {
    constructor(triangles) {
        this.triangles = triangles; // array of [p1, p2, p3] (each p is [x, y, z])
    }
    getTriangles() {
        return this.triangles;
    }
    getLabels() {
        // If triangles are arrays of vertex objects with .label, collect unique labels
        const labels = new Set();
        for (const tri of this.triangles) {
            for (const v of tri) {
                if (v.label) labels.add(v.label);
            }
        }
        return Array.from(labels);
    }
    getEdges() {
        // Return unique edges as sorted label pairs or positions
        const edges = new Set();
        for (const tri of this.triangles) {
            for (let i = 0; i < 3; i++) {
                const a = tri[i],
                    b = tri[(i + 1) % 3];
                edges.add([a, b]);
            }
        }
        return Array.from(edges)
            .map((e) => [e[0] > e[1] ? e[0] : e[1], e[0] > e[1] ? e[1] : e[0]])
            .filter(
                (e, i, a) => a.findIndex((e2) => e2[0] == e[0] && e2[1] == e[1]) == i
            );
    }
    getVertices() {
        // Return unique vertices (by label if available, else by position)
        const verts = new Map();
        for (const tri of this.triangles) {
            for (const v of tri) {
                if (v.label) verts.set(v.label, v);
                else verts.set(JSON.stringify(v), v);
            }
        }
        return Array.from(verts.values());
    }
}

// Update generateGeodesicFaces to return a Faces object
function generateGeodesicFaces(frequency = 1, radius = CONSTANTS.R) {
    console.log(
        `[SimpleDome] Generating frequency ${frequency} faces with radius ${radius}`
    );
    const faceMap = generateIcosahedronFaces();
    let allTriangles = [];
    for (const verts of faceMap.values()) {
        allTriangles.push(...subdivideFace(verts, frequency, radius));
    }
    console.log(
        `[SimpleDome] Created ${allTriangles.length} subdivided triangles`
    );
    return new Faces(allTriangles);
}

// Generate geodesic dome vertices for different frequencies
function generateGeodesicVertices(frequency = 1, radius = CONSTANTS.R) {
    console.log(
        `[SimpleDome] Generating frequency ${frequency} dome with radius ${radius}`
    );

    // Create edges as pairs of normalized vertex coordinates
    let vertices = [];
    // Add all original vertices
    RAW_VERTICES.forEach((v, index) => {
        const nv = normalize(v.pos, radius);
        vertices.push(nv);
        console.log(
            `[SimpleDome] Added vertex ${index}: ${getVertexLabel(v, index)} at ${nv}`
        );
    });

    for (let pass = 1; pass <= frequency; pass++) {
        calculateEdgesFromVertices(vertices, pass).forEach(([i, j]) => {
            const v1 = vertices[i];
            const v2 = vertices[j];
            vertices = [
                ...new Set([...vertices, ...subDivideOnEdge(v1, v2, radius, pass)]),
            ];
        });
    }
    console.log("Calculated vertices: ", vertices);
    return vertices;
}

function subDivideOnEdge(v1, v2, radius, frequency) {
    const points = frequency - 1;
    const additionalVertices = [];
    for (let t = 1; t <= points; t++) {
        const ratio = t / frequency;
        const x = v1[0] + ratio * (v2[0] - v1[0]);
        const y = v1[1] + ratio * (v2[1] - v1[1]);
        const z = v1[2] + ratio * (v2[2] - v1[2]);
        const subPoint = normalize([x, y, z], radius);
        additionalVertices.push(subPoint);
    }
    return additionalVertices;
}

function calculateEdgesFromVertices(vertices, frequency = 1, epsilon = 1e-5) {
    // For geodesic domes, we need to create the proper triangulation
    // This includes both outer shell edges and inner triangle edges
    const edges = [];
    const distances = [];

    // First, collect all distances
    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dx = vertices[i][0] - vertices[j][0];
            const dy = vertices[i][1] - vertices[j][1];
            const dz = vertices[i][2] - vertices[j][2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > epsilon) {
                distances.push(dist);
            }
        }
    }

    // Sort distances and find distinct strut lengths with counts
    distances.sort((a, b) => a - b);
    const strutLengths = [];
    const strutCounts = [];
    let lastDist = -1;
    let currentCount = 0;

    for (const dist of distances) {
        if (Math.abs(dist - lastDist) > epsilon * 10) {
            if (lastDist !== -1) {
                strutLengths.push(lastDist);
                strutCounts.push(currentCount);
            }
            lastDist = dist;
            currentCount = 1;
        } else {
            currentCount++;
        }
    }
    // Don't forget the last group
    if (lastDist !== -1) {
        strutLengths.push(lastDist);
        strutCounts.push(currentCount);
    }

    // Use frequency to determine how many strut lengths to include
    // Frequency 1: 1 strut length (icosahedron edges)
    // Frequency 2: 2 strut lengths (outer + inner triangle edges)
    // Frequency 3: 3 strut lengths (multiple subdivision levels)
    console.log("Potential strut lengths: ", strutLengths);
    console.log("Strut length counts: ", strutCounts);
    const maxStrutTypes = Math.min(frequency, strutLengths.length);
    const targetLengths = strutLengths.slice(0, maxStrutTypes);
    const targetCounts = strutCounts.slice(0, maxStrutTypes);

    console.log(
        `[SimpleDome] Frequency ${frequency}: Found ${targetLengths.length} strut lengths:`,
        targetLengths.map((d, i) => `${d.toFixed(3)} (${targetCounts[i]} edges)`)
    );

    // Create edges for all target strut lengths
    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dx = vertices[i][0] - vertices[j][0];
            const dy = vertices[i][1] - vertices[j][1];
            const dz = vertices[i][2] - vertices[j][2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Check if this distance matches any of our target strut lengths
            for (const targetLength of targetLengths) {
                if (Math.abs(dist - targetLength) < epsilon * 10) {
                    edges.push([i, j]);
                    break; // Only add each edge once
                }
            }
        }
    }

    console.log(
        `[SimpleDome] Generated ${edges.length} edges for frequency ${frequency} geodesic triangulation`
    );
    return edges;
}

function createVerticeText(labelText, vertice, baseRadius) {
    const outlines = text.vectorText(labelText);
    const segmentToPath = (segment) => {
        return path2.fromPoints({ close: true }, segment);
    };
    return translate(
        normalize(vertice, baseRadius),
        outlines.map((segment) => segmentToPath(segment))
    );
}

function createStruts(
    edges,
    scaledStrutHeight,
    scaledStrutWidth,
    strutType,
    strutShrinkPercent = 0,
    debugStep = 0
) {
    const objects = [];
    const strutStore = new Strut();
    console.log(`[SimpleDome] Creating struts for ${edges.length} edges`);
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
        let edge = edges[edgeIndex];
        const v1 = edge[0];
        const v2 = edge[1];
        let strut;
        if (strutType == "linear") {
            strut = cylinderFromTo(v1, v2, 0.1 * scaledStrutHeight, 4, strutShrinkPercent); // 4 segments, very thin
        } else if (strutType == "cylindrical") {
            strut = cylinderFromTo(v1, v2, scaledStrutHeight, CONSTANTS.STRUT_SEGMENTS, strutShrinkPercent);
        } else if (strutType == "rectangular") {
            strut = cuboidFromTo(
                v1,
                v2,
                scaledStrutWidth,
                scaledStrutHeight,
                strutShrinkPercent,
                debugStep
            );
        }
        // Attach endpoints for later matching
        strut._v1 = v1;
        strut._v2 = v2;
        strutStore.addStrut(strut, v1, v2, strutType, scaledStrutWidth, scaledStrutHeight);
        const coloredStrut = colorize(ColorUtils.getNextColor(), strut);
        objects.push(coloredStrut);
    }
    console.log(`[SimpleDome] Created ${objects.length} struts`);
    // Optionally return both objects and strutStore if needed elsewhere
    return { objects, strutStore };
}

function createFaces(triangles) {
    const objects = [];
    for (let faceIndex = 0; faceIndex < triangles.length; faceIndex++) {
        const triangle = triangles[faceIndex];
        const [v1, v2, v3] = triangle;
        // Create a triangular face using polyhedron
        const points = [v1, v2, v3];
        const faces = [[0, 1, 2]]; // Single triangular face
        const face = polyhedron({
            points: points,
            faces: faces,
            orientation: "outward",
        });
        // Use half opacity (alpha = 0.5)
        const coloredFace = colorize([...ColorUtils.getNextColor(), 0.5], face);
        objects.push(coloredFace);
    }
    console.log(`[SimpleDome] Created ${objects.length} faces`);
    return objects;
}

// Subdivide a single face into smaller triangles
function subdivideFace(face, frequency, radius) {
    // face: [vA, vB, vC] (each v has .pos)
    // Returns: array of triangles, each as [p1, p2, p3] (all normalized)
    const [vA, vB, vC] = face;
    const A = vA.pos,
        B = vB.pos,
        C = vC.pos;
    const points = [];
    // Create grid of points using barycentric coordinates
    for (let i = 0; i <= frequency; i++) {
        for (let j = 0; j <= frequency - i; j++) {
            let k = frequency - i - j;
            // Weighted sum
            let x = (A[0] * i + B[0] * j + C[0] * k) / frequency;
            let y = (A[1] * i + B[1] * j + C[1] * k) / frequency;
            let z = (A[2] * i + B[2] * j + C[2] * k) / frequency;
            // Normalize to sphere
            const len = Math.sqrt(x * x + y * y + z * z);
            points.push([(x * radius) / len, (y * radius) / len, (z * radius) / len]);
        }
    }
    // Helper to get point index in the 1D array
    function idx(i, j) {
        return i * (frequency + 1) - (i * (i - 1)) / 2 + j;
    }
    // Create triangles
    const triangles = [];
    for (let i = 0; i < frequency; i++) {
        for (let j = 0; j < frequency - i; j++) {
            // Lower triangle
            let a = idx(i, j);
            let b = idx(i + 1, j);
            let c = idx(i, j + 1);
            triangles.push([points[a], points[b], points[c]]);
            // Upper triangle (if not on the edge)
            if (j < frequency - i - 1) {
                let d = idx(i + 1, j + 1);
                triangles.push([points[b], points[d], points[c]]);
            }
        }
    }
    return triangles;
}

/**
 * Calculates the global shrink percentage needed to prevent any strut overlap at any vertex in the dome.
 * Finds the smallest angle between any two struts at any vertex, and uses that to compute the shrink percentage.
 * @param {Faces} faces - The Faces object containing all triangles.
 * @param {string} strutType - 'cylindrical' or 'rectangular'.
 * @param {number} strutRadius - For cylindrical: radius. For rectangular: half the width or height (whichever is larger in the plane of intersection).
 * @param {number} strutWidth - For rectangular struts.
 * @param {number} strutHeight - For rectangular struts.
 * @param {number} typicalStrutLength - Typical or minimum strut length to use for conservative shrink percentage.
 * @returns {number} shrink percentage (0-1)
 */
function calculateGlobalStrutShrinkPercent(faces, strutType, strutRadius, strutWidth = null, strutHeight = null, typicalStrutLength = null) {
    // For each vertex, get all connected vertices
    const vertices = faces.getVertices();
    let minAngle = Math.PI;
    let minStrutLength = Infinity;
    for (const vertex of vertices) {
        // Find all connected vertices
        const connected = faces.getEdges()
            .filter(edge => (vec3.equals(edge[0], vertex) || vec3.equals(edge[1], vertex)))
            .map(edge => (vec3.equals(edge[0], vertex) ? edge[1] : edge[0]))
            .filter((pt, idx, arr) => arr.findIndex(other => vec3.equals(pt, other)) === idx);
        // Direction vectors
        const directions = connected.map(v => {
            const dx = v[0] - vertex[0];
            const dy = v[1] - vertex[1];
            const dz = v[2] - vertex[2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-8) return [0, 0, 0];
            // Track minimum strut length
            if (len < minStrutLength) minStrutLength = len;
            return [dx / len, dy / len, dz / len];
        });
        // Find minimum angle at this vertex
        for (let i = 0; i < directions.length; i++) {
            for (let j = i + 1; j < directions.length; j++) {
                const dot = directions[i][0] * directions[j][0] + directions[i][1] * directions[j][1] + directions[i][2] * directions[j][2];
                const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                if (angle < minAngle) minAngle = angle;
            }
        }
    }
    // Determine effective radius for shrink calculation
    let effectiveRadius = strutRadius;
    if (strutType === 'rectangular' && strutWidth !== null && strutHeight !== null) {
        effectiveRadius = 0.5 * Math.sqrt(strutWidth * strutWidth + strutHeight * strutHeight);
    }
    // Use the minimum strut length found, unless a typicalStrutLength is provided
    const strutLength = typicalStrutLength || minStrutLength;
    // Safe penetration distance
    const d = effectiveRadius / Math.sin(minAngle / 2);
    // Shrink percentage
    return Math.min(1, (2 * d) / strutLength);
}
