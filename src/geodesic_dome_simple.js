const { primitives, transforms, maths, colors, text, extrusions, geometries, booleans, expansions } = jscadModeling;
const { cylinder, sphere } = primitives;
const { translate, rotate, scale } = transforms;
const { vec3 } = maths;
const { colorize } = colors;
const { geom2, path2 } = geometries

// Performance optimization: reduce segment counts for faster rendering
const PHI = (1 + Math.sqrt(5)) / 2;
const R = 100;
const STRUT_SEGMENTS = 8;  // Reduced from 16
const SPHERE_SEGMENTS = 12; // Reduced from default 24

// Canonical icosahedron vertices with clear labels and north pole on top
const RAW_VERTICES = new Map([
    ['N', { pos: [0, PHI, 1], label: 'N' }],   // 0: North pole
    ['S', { pos: [0, -PHI, -1], label: 'S' }],   // 1: South pole
    ['A', { pos: [PHI, 1, 0], label: 'A' }],   // 2
    ['B', { pos: [-PHI, 1, 0], label: 'B' }],   // 3
    ['C', { pos: [PHI, -1, 0], label: 'C' }],   // 4
    ['D', { pos: [-PHI, -1, 0], label: 'D' }],   // 5
    ['E', { pos: [1, 0, PHI], label: 'E' }],    // 6
    ['F', { pos: [-1, 0, PHI], label: 'F' }],   // 7
    ['G', { pos: [1, 0, -PHI], label: 'G' }],    // 8
    ['H', { pos: [-1, 0, -PHI], label: 'H' }],   // 9
    ['I', { pos: [0, PHI, -1], label: 'I' }],   // 10
    ['J', { pos: [0, -PHI, 1], label: 'J' }],   // 11
]);

// Canonical icosahedron faces using the above labels
const ICOSAHEDRON_FACE_LABELS = [
    ['N', 'E', 'A'], ['N', 'I', 'B'], ['N', 'B', 'F'], ['C', 'A', 'E'],
    ['A', 'C', 'G'], ['N', 'F', 'E'], ['N', 'A', 'I'], ['A', 'G', 'I'],
    ['I', 'H', 'B'], ['B', 'H', 'D'], ['B', 'D', 'F'], ['F', 'D', 'J'],
    ['J', 'D', 'S'], ['F', 'J', 'E'], ['J', 'C', 'E'], ['J', 'S', 'C'],
    ['S', 'D', 'H'], ['G', 'S', 'H'], ['C', 'S', 'G'], ['G', 'H', 'I']
];

// Helper to get array of vertex objects (for index-based access)
function getRawVerticesArray() {
    return Array.from(RAW_VERTICES.values());
}

function generateIcosahedronFaces() {
    // Returns a Map: key = 'label1,label2,label3', value = [vertexObj1, vertexObj2, vertexObj3]
    const faceMap = new Map();
    for (const labels of ICOSAHEDRON_FACE_LABELS) {
        const verts = labels.map(label => RAW_VERTICES.get(label));
        faceMap.set(labels.join(','), verts);
    }
    return faceMap;
}

const RAW_FACES = generateIcosahedronFaces();

let lastColor = null;
function getNextColor() {
    let newColor;
    let attempts = 0;
    const maxAttempts = 50;

    do {
        // Generate random HSL values
        const hue = Math.random() * 360;
        const saturation = 0.6 + Math.random() * 0.4; // 60-100% saturation for vibrant colors
        const lightness = 0.4 + Math.random() * 0.3;  // 40-70% lightness for good visibility

        // Convert HSL to RGB
        const h = hue / 60;
        const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
        const x = c * (1 - Math.abs(h % 2 - 1));
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
        if (lastColor === null) {
            break; // First color, accept it
        }

        // Calculate color difference using Euclidean distance in RGB space
        const dr = newColor[0] - lastColor[0];
        const dg = newColor[1] - lastColor[1];
        const db = newColor[2] - lastColor[2];
        const distance = Math.sqrt(dr * dr + dg * dg + db * db);

        // Accept if distance is greater than threshold (0.3 is a good threshold)
        if (distance > 0.3) {
            break;
        }
    } while (attempts < maxAttempts);

    lastColor = newColor;
    return newColor;
}

function cylinderFromTo(p1, p2, radius, segments) {
    const sqr = x => x * x

    let dx = p2[0] - p1[0]
    let dy = p2[1] - p1[1]
    let dz = p2[2] - p1[2]

    let height = Math.sqrt(sqr(dx) + sqr(dy) + sqr(dz))
    let obj = cylinder({
        height: height,
        radius: radius,
        segments: segments
    });

    if (dx || dy) {
        let dxy = Math.sqrt(sqr(dx) + sqr(dy))

        let ay = Math.atan(dxy / dz) * (dx < 0 ? -1 : 1)
        let az = Math.atan(dy / dx)
        let ax = dz < 0 ? -Math.PI : 0
        obj = transforms.rotate([ax, ay, az], obj)
    }

    let mid = [p1[0] + dx / 2, p1[1] + dy / 2, p1[2] + dz / 2]

    return translate(mid, obj)
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
    return [x * radius / len, y * radius / len, z * radius / len];
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
                const a = tri[i], b = tri[(i + 1) % 3];
                edges.add([a, b]);
            }
        }
        return Array.from(edges);
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
function generateGeodesicFaces(frequency = 1, radius = R) {
    console.log(`[SimpleDome] Generating frequency ${frequency} faces with radius ${radius}`);
    const faceMap = generateIcosahedronFaces();
    let allTriangles = [];
    for (const verts of faceMap.values()) {
        allTriangles.push(...subdivideFace(verts, frequency, radius));
    }
    console.log(`[SimpleDome] Created ${allTriangles.length} subdivided triangles`);
    return new Faces(allTriangles);
}

// Generate geodesic dome vertices for different frequencies
function generateGeodesicVertices(frequency = 1, radius = R) {
    console.log(`[SimpleDome] Generating frequency ${frequency} dome with radius ${radius}`);

    // Create edges as pairs of normalized vertex coordinates
    let vertices = [];
    // Add all original vertices
    RAW_VERTICES.forEach((v, index) => {
        const nv = normalize(v.pos, radius);
        vertices.push(nv);
        console.log(`[SimpleDome] Added vertex ${index}: ${getVertexLabel(v, index)} at ${nv}`);
    });

    for (let pass = 1; pass <= frequency; pass++) {
        calculateEdgesFromVertices(vertices, pass).forEach(([i, j]) => {
            const v1 = vertices[i];
            const v2 = vertices[j];
            vertices = [...new Set([...vertices, ...subDivideOnEdge(v1, v2, radius, pass)])];
        });
    }
    console.log("Calculated vertices: ", vertices)
    return vertices;
}

function subDivideOnEdge(v1, v2, radius, frequency) {
    const points = frequency - 1
    const additionalVertices = []
    for (let t = 1; t <= points; t++) {
        const ratio = t / frequency;
        const x = v1[0] + ratio * (v2[0] - v1[0]);
        const y = v1[1] + ratio * (v2[1] - v1[1]);
        const z = v1[2] + ratio * (v2[2] - v1[2]);
        const subPoint = normalize([x, y, z], radius);
        additionalVertices.push(subPoint);

    }
    return additionalVertices
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

    console.log(`[SimpleDome] Frequency ${frequency}: Found ${targetLengths.length} strut lengths:`, targetLengths.map((d, i) => `${d.toFixed(3)} (${targetCounts[i]} edges)`));

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

    console.log(`[SimpleDome] Generated ${edges.length} edges for frequency ${frequency} geodesic triangulation`);
    return edges;
}

export function getParameterDefinitions() {
    return [
        { name: 'frequency', type: 'number', initial: 1, min: 1, max: 3, step: 1, caption: 'Frequency' },
        { name: 'strutRadius', type: 'number', initial: 1, min: 1, max: 100, step: 0.01, caption: 'Strut Radius' },
        { name: 'sphereRadius', type: 'number', initial: 2, min: 1, max: 100, step: 0.01, caption: 'Sphere Radius' },
        { name: 'domeSize', type: 'number', initial: 100, min: 1, max: 300, step: 0.1, caption: 'Dome Size' },
        { name: 'useLinesForStruts', type: 'checkbox', checked: true, caption: 'Use Lines for Struts (Faster)' },
        { name: 'useCubesForVertices', type: 'checkbox', checked: true, caption: 'Use Cubes for Vertices (Faster)' },
        { name: 'showVertexLabels', type: 'checkbox', checked: true, caption: 'Show Vertex Labels (Debug)' }
    ];
}

export function main(params) {
    console.log('=== Geodesic Dome Simple - Main Function Start ===');
    console.log('Parameters:', params);

    const { frequency, strutRadius, sphereRadius, domeSize, useLinesForStruts, useCubesForVertices, showVertexLabels } = params;

    // Scale the base radius by dome size
    const baseRadius = 1 * domeSize;
    const scaledStrutRadius = strutRadius;
    const scaledSphereRadius = sphereRadius;

    console.log('Base radius:', baseRadius);
    console.log('Scaled strut radius:', scaledStrutRadius);
    console.log('Scaled sphere radius:', scaledSphereRadius);

    // Generate faces based on frequency
    const faces = generateGeodesicFaces(frequency, baseRadius);

    // // Generate vertices based on frequency
    // const vertices = generateGeodesicVertices(frequency, baseRadius);
    // console.log('Generated vertices:', vertices.length);

    const objects = [];

    if (showVertexLabels) {
        const labelObjects = RAW_VERTICES.entries().map(([key, val]) => {
            return createVerticeText(key, val.pos, baseRadius)
        })
        objects.push(...labelObjects);
    }

    // Create struts from each vertex to midpoints of nearest neighbors
    const strutObjects = createStruts(faces.getEdges(), scaledStrutRadius, useLinesForStruts);
    objects.push(...strutObjects);

    // Create faces from the generated faces
    const faceObjects = createFaces(faces.getTriangles(), scaledStrutRadius);
    objects.push(...faceObjects);

    // // Add spheres or cubes at vertices
    // for (let i = 0; i < vertices.length; i++) {
    //     const vertexLabel = i < RAW_VERTICES.length ? getVertexLabel(RAW_VERTICES[i], i) : `v${i}`;
    //     console.log(`Adding vertex at ${i} (${vertexLabel}):`, vertices[i]);
    //     let shape;
    //     if (useCubesForVertices) {
    //         shape = primitives.cuboid({ size: [2 * scaledSphereRadius, 2 * scaledSphereRadius, 2 * scaledSphereRadius], center: vertices[i] });
    //     } else {
    //         shape = primitives.sphere({ radius: scaledSphereRadius, center: vertices[i], segments: SPHERE_SEGMENTS });
    //     }
    //     const coloredShape = colorize(getNextColor(), shape);
    //     objects.push(coloredShape);
    // }

    console.log(`[SimpleDome] Created ${objects.length} objects.`);
    return objects;
}

function createVerticeText(labelText, vertice, baseRadius) {
    const outlines = text.vectorText(labelText);
    const segmentToPath = (segment) => {
        return path2.fromPoints({ close: true }, segment)
    }
    return translate(normalize(vertice, baseRadius), outlines.map((segment) => segmentToPath(segment)))
}

function createStruts(edges, scaledStrutRadius, useLinesForStruts) {
    const objects = [];
    console.log(`[SimpleDome] Creating struts for ${edges.length} edges`);

    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
        let edge = edges[edgeIndex]
        const v1 = edge[0]
        const v2 = edge[1]
        let strut;
        if (useLinesForStruts) {
            strut = cylinderFromTo(v1, v2, 0.1 * scaledStrutRadius, 4); // 4 segments, very thin
        } else {
            strut = cylinderFromTo(v1, v2, scaledStrutRadius, STRUT_SEGMENTS);
        }
        const coloredStrut = colorize(getNextColor(), strut);
        objects.push(coloredStrut);
    }
    console.log(`[SimpleDome] Created ${objects.length} struts`);
    return objects;
}

function joinGeometries(struts, spheres) {
    console.log(`[SimpleDome] Joining ${struts.length} struts and ${spheres.length} spheres into single geometry`);

    // Combine all geometries into one array
    const allGeometries = [...struts, ...spheres];

    if (allGeometries.length === 0) {
        console.warn('[SimpleDome] No geometries to join');
        return null;
    }

    if (allGeometries.length === 1) {
        console.log('[SimpleDome] Only one geometry, returning as-is');
        return allGeometries[0];
    }

    // Join all geometries using union
    let joinedGeometry = allGeometries[0];
    for (let i = 1; i < allGeometries.length; i++) {
        try {
            joinedGeometry = union(joinedGeometry, allGeometries[i]);
        } catch (error) {
            console.warn(`[SimpleDome] Failed to join geometry ${i}:`, error);
            // Continue with the rest
        }
    }

    console.log('[SimpleDome] Successfully joined all geometries');
    return joinedGeometry;
}

function getTrianglesFromEdges(edgeMap, radius) {
    const triangles = [];

    // Use the face map from generateIcosahedronFaces
    const faceMap = generateIcosahedronFaces();
    for (const verts of faceMap.values()) {
        const [v1, v2, v3] = verts;
        triangles.push([
            normalize(v1.pos, radius),
            normalize(v2.pos, radius),
            normalize(v3.pos, radius)
        ]);
    }

    console.log(`[SimpleDome] Created ${triangles.length} triangles from ${faceMap.size} faces`);
    return triangles;
}

function createFaces(triangles, scaledFaceThickness = 1) {
    const objects = [];
    for (let faceIndex = 0; faceIndex < triangles.length; faceIndex++) {
        const triangle = triangles[faceIndex];
        const [v1, v2, v3] = triangle;
        // Create a triangular face using polyhedron
        const points = [v1, v2, v3];
        const faces = [[0, 1, 2]]; // Single triangular face
        const face = primitives.polyhedron({
            points: points,
            faces: faces,
            orientation: 'outward'
        });
        // Use half opacity (alpha = 0.5)
        const coloredFace = colorize([...getNextColor(), 0.5], face);
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
    const A = vA.pos, B = vB.pos, C = vC.pos;
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
            points.push([x * radius / len, y * radius / len, z * radius / len]);
        }
    }
    // Helper to get point index in the 1D array
    function idx(i, j) {
        return (i * (frequency + 1) - (i * (i - 1)) / 2 + j);
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
