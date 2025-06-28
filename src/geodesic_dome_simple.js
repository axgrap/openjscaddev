//TODO make an object to hold the vertices and struts so they can have additional properties (like color, label, etc)
//TODO make a function to determine the neighbors of a vertex that are required to be connected to create the outer shell.
const { primitives, transforms, maths, colors } = jscadModeling;
const { cylinder, sphere } = primitives;
const { translate, rotate } = transforms;
const { vec3 } = maths;
const { colorize } = colors;

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

const PHI = (1 + Math.sqrt(5)) / 2;
const R = 100;

// Normalize so all vertices are on the sphere of given radius
function normalize([x, y, z], radius) {
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-8) {
        // Avoid division by zero, return origin (or skip in caller)
        return [0, 0, 0];
    }
    return [x * radius / len, y * radius / len, z * radius / len];
}

function isDuplicateVertex(vertices, v, epsilon = 1e-6) {
    return vertices.some(([x, y, z]) =>
        Math.abs(x - v[0]) < epsilon &&
        Math.abs(y - v[1]) < epsilon &&
        Math.abs(z - v[2]) < epsilon
    );
}

// Generate geodesic dome vertices for different frequencies
function generateGeodesicVertices(frequency = 1, radius = R) {
    console.log(`[SimpleDome] Generating frequency ${frequency} dome with radius ${radius}`);

    const rawVertices = [
        [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
        [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
        [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
    ];
    let vertices = [];
    // Add all original vertices
    rawVertices.forEach(v => {
        const nv = normalize(v, radius);
        if (!isDuplicateVertex(vertices, nv)) {
            vertices.push(nv);
        }
    });
    for (let pass = 1; pass <= frequency; pass++) {
        calculateEdgesFromVertices(vertices).forEach(([i, j]) => {
            const v1 = vertices[i];
            const v2 = vertices[j];
            vertices = [...new Set([...vertices, ...subDivideOnEdge(v1, v2, radius, pass)])];
        });
    }
    console.log("Calculated vertices: ", vertices)
    return vertices;

    // if (frequency === 1) {
    //     // Frequency 1: All icosahedron vertices
    //     return rawVertices.map(v => normalize(v, radius));

    // } else if (frequency === 2) {
    //     const vertices = [];
    //     // Add all original vertices
    //     rawVertices.forEach(v => {
    //         const nv = normalize(v, radius);
    //         if (!isDuplicateVertex(vertices, nv)) {
    //             vertices.push(nv);
    //         }
    //     });
    //     // Add edge midpoints for frequency 2
    //     calculateEdgesFromVertices(rawVertices).forEach(([i, j]) => {
    //         const v1 = rawVertices[i];
    //         const v2 = rawVertices[j];
    //         const midX = (v1[0] + v2[0]) / 2;
    //         const midY = (v1[1] + v2[1]) / 2;
    //         const midZ = (v1[2] + v2[2]) / 2;
    //         const midpoint = normalize([midX, midY, midZ], radius);
    //         if (!isDuplicateVertex(vertices, midpoint)) {
    //             vertices.push(midpoint);
    //         }
    //     });
    //     return vertices;

    // } else if (frequency === 3) {
    //     let vertices = [];
    //     // Add all original vertices
    //     rawVertices.forEach(v => {
    //         const nv = normalize(v, radius);
    //         if (!isDuplicateVertex(vertices, nv)) {
    //             vertices.push(nv);
    //         }
    //     });
    //     for (let pass = 1; pass <= frequency; pass++) {
    //         calculateEdgesFromVertices(vertices).forEach(([i, j]) => {
    //             const v1 = vertices[i];
    //             const v2 = vertices[j];
    //             vertices = [...new Set([...vertices, ...subDivideOnEdge(v1, v2, radius, pass)])];
    //         });
    //     }
    //     console.log("Calculated vertices: ", vertices)
    //     return vertices;

    // } else {
    //     console.warn(`[SimpleDome] Frequency ${frequency} not implemented, using frequency 1`);
    //     return generateGeodesicVertices(1, radius);
    // }
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
        if (!isDuplicateVertex(additionalVertices, subPoint)) {
            console.log("Adding sub-point", subPoint)
            additionalVertices.push(subPoint);
        }
    }
    return additionalVertices
}

function calculateEdgesFromVertices(vertices, epsilon = 1e-5) {
    // Find all unique pairs and their distances
    const edges = [];
    let minDist = Infinity;
    // First, find the minimum nonzero distance (strut length)
    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dx = vertices[i][0] - vertices[j][0];
            const dy = vertices[i][1] - vertices[j][1];
            const dz = vertices[i][2] - vertices[j][2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > epsilon && dist < minDist) {
                minDist = dist;
            }
        }
    }
    // Now, collect all pairs within a small tolerance of minDist
    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dx = vertices[i][0] - vertices[j][0];
            const dy = vertices[i][1] - vertices[j][1];
            const dz = vertices[i][2] - vertices[j][2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (Math.abs(dist - minDist) < epsilon * 10) {
                edges.push([i, j]);
            }
        }
    }
    return edges;
}

export function getParameterDefinitions() {
    return [
        { name: 'frequency', type: 'number', initial: 3, min: 1, max: 3, step: 1, caption: 'Frequency' },
        { name: 'strutRadius', type: 'number', initial: 3, min: 1, max: 100, step: 0.01, caption: 'Strut Radius' },
        { name: 'sphereRadius', type: 'number', initial: 5, min: 1, max: 100, step: 0.01, caption: 'Sphere Radius' },
        { name: 'domeSize', type: 'number', initial: 100, min: 1, max: 300, step: 0.1, caption: 'Dome Size' }
    ];
}

export function main(params) {
    console.log('=== Geodesic Dome Simple - Main Function Start ===');
    console.log('Parameters:', params);

    const { frequency, strutRadius, sphereRadius, domeSize } = params;

    // Scale the base radius by dome size
    const baseRadius = 1 * domeSize;
    const scaledStrutRadius = strutRadius;
    const scaledSphereRadius = sphereRadius;

    console.log('Base radius:', baseRadius);
    console.log('Scaled strut radius:', scaledStrutRadius);
    console.log('Scaled sphere radius:', scaledSphereRadius);

    // Generate vertices based on frequency
    const vertices = generateGeodesicVertices(frequency, baseRadius);
    console.log('Generated vertices:', vertices.length);

    // Create struts from each vertex to midpoints of nearest neighbors
    const objects = createStruts(vertices, scaledStrutRadius, baseRadius);

    // Add spheres at vertices
    for (let i = 0; i < vertices.length; i++) {
        console.log(`Adding sphere at vertex ${i}:`, vertices[i]);
        const sphere = primitives.sphere({ radius: scaledSphereRadius, center: vertices[i] });
        const coloredSphere = colorize(getNextColor(), sphere);
        objects.push(coloredSphere);
    }

    console.log(`[SimpleDome] Created ${objects.length} objects.`);
    return objects;
}

function createStruts(vertices, scaledStrutRadius, baseRadius) {
    const objects = [];
    for (let i = 0; i < vertices.length; i++) {
        const vertex = vertices[i];
        console.log(`Processing vertex ${i}:`, vertex);

        // Find nearest neighbors (vertices within a certain distance)
        const neighbors = getNeighbors(vertices, vertex, baseRadius);

        // Sort by distance and take the closest 3-5 neighbors
        neighbors.sort((a, b) => a.distance - b.distance);
        const closestNeighbors = neighbors.slice(0, Math.min(6, neighbors.length));

        console.log(`Vertex ${i} has ${closestNeighbors.length} neighbors:`, closestNeighbors.map(n => n.index));

        // Create struts to midpoints of nearest neighbor pairs
        for (let j = 0; j < closestNeighbors.length; j++) {
            // for (let k = j + 1; k < closestNeighbors.length; k++) {
            const neighbor1 = closestNeighbors[j].vertex;

            // Calculate midpoint between the two neighbors
            // Calculate midpoint between this vertex and the neighbor
            const midX = (neighbor1[0] + vertex[0]) / 2;
            const midY = (neighbor1[1] + vertex[1]) / 2;
            const midZ = (neighbor1[2] + vertex[2]) / 2;
            const midpoint = [midX, midY, midZ];

            // Create strut from current vertex to midpoint
            const strut = cylinderFromTo(vertex, midpoint, scaledStrutRadius, 16);
            const coloredStrut = colorize(getNextColor(), strut);
            objects.push(coloredStrut);

            console.log(`Created strut from vertex ${i} to midpoint of vertex and ${closestNeighbors[j].index}`);
        }
    }
    return objects;
}
function getNeighbors(vertices, vertex, radius) {
    const neighbors = [];
    for (let j = 0; j < vertices.length; j++) {
        if (vertices[j] === vertex) {
            continue;
        }
        const distance = vec3.distance(vertex, vertices[j]);
        // Consider neighbors within 1.5 * radius
        if (distance < 1.5 * radius) {
            neighbors.push({ index: j, distance, vertex: vertices[j] });
        }
    }
    console.log(`Vertex ${vertex} has ${neighbors.length} neighbors:`, neighbors.map(n => n.distance));
    return neighbors;
}

