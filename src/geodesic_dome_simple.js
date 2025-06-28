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

// Normalize so all vertices are on the sphere of radius R
function normalize([x, y, z]) {
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x * R / len, y * R / len, z * R / len];
}

// Generate geodesic dome vertices for different frequencies
function generateGeodesicVertices(frequency = 1, radius = R) {
    console.log(`[SimpleDome] Generating frequency ${frequency} dome with radius ${radius}`);

    if (frequency === 1) {
        // Frequency 1: Icosahedron vertices
        const rawVertices = [
            [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
            [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
            [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
        ];
        return rawVertices.map(normalize);
    } else if (frequency === 2) {
        // Frequency 2: Subdivide icosahedron faces
        // This is a simplified version - for full frequency 2 you'd need more complex subdivision
        const baseVertices = [
            [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
            [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
            [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
        ];

        // Add midpoints of edges for frequency 2
        const vertices = [...baseVertices.map(normalize)];

        // Add some edge midpoints (simplified)
        for (let i = 0; i < baseVertices.length; i++) {
            for (let j = i + 1; j < baseVertices.length; j++) {
                const v1 = baseVertices[i];
                const v2 = baseVertices[j];
                const dx = v2[0] - v1[0];
                const dy = v2[1] - v1[1];
                const dz = v2[2] - v1[2];
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // Only add midpoints for edges that are part of the icosahedron
                if (distance < radius * 1.2) {
                    const midX = (v1[0] + v2[0]) / 2;
                    const midY = (v1[1] + v2[1]) / 2;
                    const midZ = (v1[2] + v2[2]) / 2;
                    const midpoint = normalize([midX, midY, midZ]);
                    vertices.push(midpoint);
                }
            }
        }

        return vertices;
    } else {
        // For higher frequencies, you'd implement more complex subdivision
        console.warn(`[SimpleDome] Frequency ${frequency} not implemented, using frequency 1`);
        return generateGeodesicVertices(1, radius);
    }
}


export function getParameterDefinitions() {
    return [
        { name: 'frequency', type: 'number', initial: 1, min: 1, max: 3, step: 1, caption: 'Frequency' },
        { name: 'strutRadius', type: 'number', initial: 3, min: 1, max: 100, step: 0.01, caption: 'Strut Radius' },
        { name: 'sphereRadius', type: 'number', initial: 5, min: 1, max: 100, step: 0.01, caption: 'Sphere Radius' },
        { name: 'domeSize', type: 'number', initial: 10, min: 1, max: 300, step: 0.1, caption: 'Dome Size' }
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
    const objects = createStruts(vertices, scaledStrutRadius);

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

function createStruts(vertices, scaledStrutRadius) {
    const objects = [];
    for (let i = 0; i < vertices.length; i++) {
        const vertex = vertices[i];
        console.log(`Processing vertex ${i}:`, vertex);

        // Find nearest neighbors (vertices within a certain distance)
        const neighbors = getNeighbors(vertices, vertex);

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
function getNeighbors(vertices, vertex) {
    const neighbors = [];
    for (let j = 0; j < vertices.length; j++) {
        if (vertices[j] === vertex) {
            continue;
        }
        const distance = vec3.distance(vertex, vertices[j]);
        // Consider neighbors within 1.5 * base radius
        if (distance < 1.5 * R) {
            neighbors.push({ index: j, distance, vertex: vertices[j] });
        }
    }
    console.log(`Vertex ${vertex} has ${neighbors.length} neighbors:`, neighbors.map(n => n.distance));
    return neighbors;
}

