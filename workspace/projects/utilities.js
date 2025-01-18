// Mathematical constants
const PHI = (1 + Math.sqrt(5)) / 2;
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

// Core geometric calculations
const GeometryUtils = {
    calculateVertexPosition(radius, theta, phi) {
        return {
            x: radius * Math.cos(theta * DEG_TO_RAD) * Math.cos(phi * DEG_TO_RAD),
            y: radius * Math.cos(theta * DEG_TO_RAD) * Math.sin(phi * DEG_TO_RAD),
            z: radius * Math.sin(theta * DEG_TO_RAD)
        };
    },

    calculateDistance(point1, point2) {
        return Math.sqrt(
            Math.pow(point2.x - point1.x, 2) +
            Math.pow(point2.y - point1.y, 2) +
            Math.pow(point2.z - point1.z, 2)
        );
    },

    calculateAngle(p1, p2, p3) {
        const v1 = {
            x: p2.x - p1.x,
            y: p2.y - p1.y,
            z: p2.z - p1.z
        };
        const v2 = {
            x: p3.x - p1.x,
            y: p3.y - p1.y,
            z: p3.z - p1.z
        };
        
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
        
        return Math.acos(dot / (mag1 * mag2)) * RAD_TO_DEG;
    },

    almostEqual(a, b, tolerance = 0.0001) {
        return Math.abs(a - b) < tolerance;
    }
};

// Frequency-specific calculations
const FrequencyUtils = {
    frequency1Vertices(radius) {
        const vertices = [];
        vertices.push(GeometryUtils.calculateVertexPosition(radius, 90, 0));
        
        // First ring (5 vertices at 26.57°)
        const firstRingTheta = 26.57;
        for (let i = 0; i < 5; i++) {
            vertices.push(GeometryUtils.calculateVertexPosition(radius, firstRingTheta, i * 72));
        }
        
        // Base vertices (5 vertices at 0°)
        for (let i = 0; i < 5; i++) {
            vertices.push(GeometryUtils.calculateVertexPosition(radius, 0, 36 + (i * 72)));
        }
        
        return vertices;
    },

    frequency2Vertices(radius) {
        const vertices = [];
        vertices.push(GeometryUtils.calculateVertexPosition(radius, 90, 0));
        
        // Second ring (5 vertices at 40.8°)
        for (let i = 0; i < 5; i++) {
            vertices.push(GeometryUtils.calculateVertexPosition(radius, 40.8, i * 72));
        }
        
        // First ring (10 vertices at 15.5°)
        for (let i = 0; i < 10; i++) {
            vertices.push(GeometryUtils.calculateVertexPosition(radius, 15.5, i * 36));
        }
        
        return vertices;
    },

    frequency3Vertices(radius) {
        const vertices = [];
        vertices.push(GeometryUtils.calculateVertexPosition(radius, 90, 0));
        
        // Third ring (5 vertices at 49.2°)
        for (let i = 0; i < 5; i++) {
            vertices.push(GeometryUtils.calculateVertexPosition(radius, 49.2, i * 72));
        }
        
        // Second ring (10 vertices at 30.0°)
        for (let i = 0; i < 10; i++) {
            vertices.push(GeometryUtils.calculateVertexPosition(radius, 30.0, i * 36));
        }
        
        // First ring (15 vertices at 10.8°)
        for (let i = 0; i < 15; i++) {
            vertices.push(GeometryUtils.calculateVertexPosition(radius, 10.8, i * 24));
        }
        
        return vertices;
    }
};

// Validation and testing utilities
const ValidationUtils = {
    validateDome(domeData) {
        const results = {
            sphereTest: false,
            strutLengthTest: false,
            symmetryTest: false,
            angleTest: false,
            errors: []
        };

        // Test sphere surface
        const testSphereSurface = () => {
            const radius = domeData.radius;
            for (const vertex of domeData.vertices) {
                const distanceFromCenter = GeometryUtils.calculateDistance({x: 0, y: 0, z: 0}, vertex);
                if (!GeometryUtils.almostEqual(distanceFromCenter, radius)) {
                    results.errors.push(`Vertex not on sphere surface: ${JSON.stringify(vertex)}`);
                    return false;
                }
            }
            return true;
        };

        // Test strut lengths
        const testStrutLengths = () => {
            const strutLengths = {};
            const vertices = domeData.vertices;
            
            for (let i = 0; i < vertices.length; i++) {
                for (let j = i + 1; j < vertices.length; j++) {
                    const length = GeometryUtils.calculateDistance(vertices[i], vertices[j]);
                    const roundedLength = Math.round(length * 1000) / 1000;
                    strutLengths[roundedLength] = (strutLengths[roundedLength] || 0) + 1;
                }
            }

            const expectedClasses = domeData.frequency === 1 ? 1 : 
                                  domeData.frequency === 2 ? 2 : 3;
            
            if (Object.keys(strutLengths).length !== expectedClasses) {
                results.errors.push(`Wrong number of strut classes: ${Object.keys(strutLengths).length}`);
                return false;
            }
            return true;
        };

        results.sphereTest = testSphereSurface();
        results.strutLengthTest = testStrutLengths();
        // Add other tests as needed

        return results;
    }
};

// Main dome generation function
function generateGeodesicdome(frequency, radius) {
    let vertices;
    switch(frequency) {
        case 1:
            vertices = FrequencyUtils.frequency1Vertices(radius);
            break;
        case 2:
            vertices = FrequencyUtils.frequency2Vertices(radius);
            break;
        case 3:
            vertices = FrequencyUtils.frequency3Vertices(radius);
            break;
        default:
            throw new Error('Unsupported frequency');
    }
    
    return {
        frequency,
        radius,
        vertices,
        strutLengths: calculateStrutLengths(frequency, radius),
        angles: calculateFaceAngles(frequency)
    };
}

// Export all utilities
module.exports = {
    GeometryUtils,
    FrequencyUtils,
    ValidationUtils,
    generateGeodesicdome,
    PHI,
    RAD_TO_DEG,
    DEG_TO_RAD
}; 