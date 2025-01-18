const { sphere, cylinder } = require('@jscad/modeling').primitives;
const { rotateX, rotateZ, translate } = require('@jscad/modeling').transforms;

const { union } = require('@jscad/modeling').booleans;

function getParameterDefinitions() {
    return [
        { name: 'frequency', type: 'int', initial: 2, caption: "Dome Frequency" },
        { name: 'pvcDiameter', type: 'float', initial: 25.4, caption: "PVC Pipe Diameter (mm)" },
        { name: 'insertLength', type: 'float', initial: 50, caption: "Connector Insert Length (mm)" },
        { name: 'hubDiameter', type: 'float', initial: 60, caption: "Central Hub Diameter (mm)" },
        { name: 'tolerance', type: 'float', initial: 0.2, caption: "Press Fit Tolerance (mm)" }
    ];
}

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function toDegrees(radians) {
    return radians * 180 / Math.PI;
}

function calculateGeodesicAngles(frequency) {
    // For a 2V dome (can be adjusted for other frequencies)
    const hubConfigs = {
        '5-way-top': {
            connectorCount: 5,
            angles: []
        },
        '6-way': {
            connectorCount: 6,
            angles: []
        },
        '5-way-base': {
            connectorCount: 5,
            angles: []
        }
    };
    
    // 5-way-top (vertex angle approximately 63.5°)
    for (let i = 0; i < 5; i++) {
        hubConfigs['5-way-top'].angles.push({
            theta: 63.5,
            phi: i * 72
        });
    }
    
    // 6-way (vertex angle approximately 58°)
    for (let i = 0; i < 6; i++) {
        hubConfigs['6-way'].angles.push({
            theta: 58,
            phi: i * 60
        });
    }
    
    // 5-way-base (vertex angle approximately 52°)
    for (let i = 0; i < 5; i++) {
        hubConfigs['5-way-base'].angles.push({
            theta: 52,
            phi: i * 72
        });
    }
    
    return hubConfigs;
}

function getHubTypes(frequency) {
    return calculateGeodesicAngles(frequency);
}

function createConnector(params) {
    const connectorDiameter = params.pvcDiameter - (params.tolerance * 2);
    return cylinder({
        radius: connectorDiameter / 2,
        height: params.insertLength,
        segments: 10,
        center: [0, 0, params.insertLength / 2]
    });
}

function createHub(params, hubType) {
    const hub = sphere({ radius: params.hubDiameter / 2 });
    const connectors = hubType.angles.map(angle => {
        const connector = createConnector(params);
        return rotateZ(angle.phi, 
               rotateX(angle.theta, connector));
    });
    
    return union(hub, connectors);
}

function main(params) {
    const hubTypes = getHubTypes(params.frequency);
    const spacing = params.hubDiameter * 2;
    
    // Convert object to array of hub types
    const hubTypesArray = Object.values(hubTypes);
    
    // Create all hubs with spacing between them
    return hubTypesArray.map((hubType, index) => 
        translate([index * spacing, 0, 0], 
            createHub(params, hubType)
        )
    );
}

module.exports = {
    main,
    getParameterDefinitions
}; 