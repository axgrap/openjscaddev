
const { cylinder, cuboid } = require('@jscad/modeling').primitives;
const { union, subtract } = require('@jscad/modeling').booleans;
const { translate, rotateX, rotateY, rotateZ } = require('@jscad/modeling').transforms;
const { extrudeLinear } = require('@jscad/modeling').extrusions;
const { geom2, geom3 } = require('@jscad/modeling').geometries;
const { degToRad } = require('@jscad/modeling').utils;



const HUB_CONFIGS = {
    '1v1': {
        rotation_angle: 90 - 31.73,
        sides: 6,
        bracket_count: 6
    },
    '2v1': {
        rotation_angle: 90 - 15.86,
        sides: 5,
        bracket_count: 6
    },
    '2v2': {
        rotation_angle: 90 - 15.86,
        sides: 5,
        bracket_count: 6
    }
};

function getParameterDefinitions() {
    return [
        {
            name: 'part', type: 'choice', values: ['hubs', 'bottoms', 'all'],
            caption: 'Part to Generate', initial: 'all'
        },
        {
            name: 'dome_type', type: 'choice', values: ['1v1', '2v1', '2v2'],
            caption: 'Dome Type', initial: '1v1'
        },
        { name: 'lumber_height', type: 'float', initial: 12.2, caption: 'Strut Height (mm)' },
        { name: 'lumber_width', type: 'float', initial: 12.2, caption: 'Strut Width (mm)' },
        { name: 'inset_depth', type: 'float', initial: 20, caption: 'Socket Depth (mm)' },
        {
            name: 'bracket_type', type: 'choice', values: ['rectangular', 'circular'],
            caption: 'Strut Shape', initial: 'circular'
        },
        { name: 'wall_thickness', type: 'float', initial: 4, caption: 'Wall Thickness (mm)' }
    ];
}

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function toDegrees(radians) {
    return radians * 180 / Math.PI;
}

function createRegularPolygon(sides, radius) {
    console.log('Creating polygon:', { sides, radius });
    const vertices = [];
    for (let i = 0; i < sides; i++) {
        const angle = (2 * Math.PI * i) / sides;
        vertices.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
    }
    return geom2.fromPoints(vertices);
}

function createBracket(params, negative = false) {
    console.log('Creating bracket:', { params, negative });
    const {
        bracket_type,
        lumber_height,
        lumber_width,
        inset_depth,
        wall_thickness
    } = params;

    if (bracket_type === 'rectangular') {
        const outer_width = lumber_height + (wall_thickness * 2);
        const outer_height = lumber_width + (wall_thickness * 2);
        const outer_depth = inset_depth + (wall_thickness * 2);

        return negative ?
            translate([0, 0, wall_thickness / 2],
                cuboid({
                    size: [lumber_height, lumber_width, inset_depth + 15],
                    center: [0, 0, (inset_depth + 15) / 2]
                })
            ) :
            cuboid({
                size: [outer_width, outer_height, outer_depth],
                center: [0, 0, outer_depth / 2]
            });
    }

    // Circular bracket
    const outer_radius = (lumber_height / 2) + wall_thickness;
    return negative ?
        translate([0, 0, wall_thickness / 2],
            cylinder({
                radius: lumber_height / 2,
                height: inset_depth + 15,
                center: [0, 0, (inset_depth + 15) / 2]
            })
        ) :
        cylinder({
            radius: outer_radius,
            height: inset_depth + wall_thickness,
            center: [0, 0, (inset_depth + wall_thickness) / 2]
        });
}

function createRotatedBracket(params, {
    center_polygon_radius,
    center_polygon_height,
    rotation_angle,
    offset_angle,
    negative = false,
    bracket_label = ''
}) {
    console.log('Creating rotated bracket:', {
        params,
        rotation_angle: rotation_angle,
        offset_angle: offset_angle
    });

    const rotated_calculated_height = (Math.sin(toRadians(rotation_angle)) * params.lumber_height) +
        params.wall_thickness * 2;

    let bracket = createBracket(params, negative, bracket_label);
    bracket = rotateX(toRadians(rotation_angle), bracket);
    //    bracket = translate([
    //        center_polygon_radius + params.wall_thickness * 2,
    //        0,
    //        rotated_calculated_height - (center_polygon_height/2)
    //
    //    ], bracket);


    //TODO
    bracket = rotateZ(toRadians(offset_angle), bracket);

    return bracket;
}

function createCenterPolygon(params, {
    sides,
    radius,
    height,
    wallThickness,
    negative = false
}) {
    const inset_height = height + wallThickness + 5;
    const inset_radius = radius - wallThickness;

    if (negative) {
        const polygon = createRegularPolygon(sides, inset_radius);
        return translate([0, 0, wallThickness],
            extrudeLinear({ height: inset_height }, polygon)
        );
    } else {
        const basePolygon = createRegularPolygon(sides, radius);
        return extrudeLinear({
            height: height / 3,
            twistAngle: 0,
            twistSteps: 1,
            scale: 1.5
        }, basePolygon);
    }
}

function createConnector(params, {
    number_of_sides,
    center_polygon_radius,
    center_polygon_height,
    rotation_angle,
    bracket_count = 0,
    bracket_angles = [],
    bracket_labels = [],
    solid_center = false
}) {
    console.log('Creating connector:', {
        params,
        sides: number_of_sides,
        bracket_count: bracket_count
    });

    bracket_count = bracket_count || number_of_sides;
    let parts = [];

    if (!solid_center) {
        parts.push(
            rotateZ(toRadians(36),
                createCenterPolygon(params, {
                    sides: number_of_sides,
                    radius: center_polygon_radius - params.wall_thickness,
                    height: params.wall_thickness,
                    wallThickness: params.wall_thickness
                })
            )
        );
    }

    parts.push(
        createCenterPolygon(params, {
            sides: 5,
            radius: center_polygon_radius * 2,
            height: 30,
            wallThickness: params.wall_thickness
        })
    );

    for (let i = 0; i < bracket_count; i++) {
        const bracketParams = {
            center_polygon_radius,
            center_polygon_height,
            rotation_angle: bracket_angles[i],
            offset_angle: (360 / number_of_sides) * i,
            bracket_label: bracket_labels[i]
        };
        parts.push(createRotatedBracket(params, bracketParams));
    }

    let result = union(parts);

    if (!solid_center) {
        let cutouts = [];

        cutouts.push(
            rotateZ(toRadians(36),
                createCenterPolygon(params, {
                    sides: number_of_sides,
                    radius: center_polygon_radius - params.wall_thickness,
                    height: center_polygon_height * 2,
                    wallThickness: params.wall_thickness,
                    negative: true
                })
            )
        );

        for (let i = 0; i < bracket_count; i++) {
            cutouts.push(
                createRotatedBracket(params, {
                    center_polygon_radius,
                    center_polygon_height,
                    rotation_angle: bracket_angles[i],
                    offset_angle: (360 / number_of_sides) * i,
                    bracket_label: bracket_labels[i],
                    negative: true
                })
            );
        }
        //TODO make this if else
        //result = subtract(result, ...cutouts);
        result = union(result, ...cutouts);
    }

    return result;
}

function createHub(params, type) {
    console.log('Hub Configs:', HUB_CONFIGS)
    const config = HUB_CONFIGS[type];
    console.log('Hub Config:', config);
    console.log('Parameters:', params);

    const { rotation_angle, sides, bracket_count } = config;
    const calculated_height = (Math.sin(toRadians(rotation_angle)) * params.lumber_height) +
        params.wall_thickness * 2;

    console.log('Calculated height:', calculated_height);

    const center_polygon_radius = (params.lumber_width + params.wall_thickness / 2) /
        (2 * Math.sin(Math.PI / sides));

    return createConnector(params, {
        number_of_sides: sides,
        center_polygon_radius,
        center_polygon_height: calculated_height,
        rotation_angle,
        bracket_count,
        bracket_angles: Array(bracket_count).fill(rotation_angle),
        bracket_labels: Array(bracket_count).fill("A")
    });
}


function main(params) {
    console.log('Starting main with params:', params);
    const parts = [];
    const { dome_type, part, inset_depth } = params;

    parts.push(createHub(params, dome_type));

    // if (part === "hubs" || part === "all") {
    //     parts.push(createHub(params, dome_type));
    //     if (dome_type === "2v") {
    //         parts.push(translate([inset_depth * 4, 0, 0], createHub(params, dome_type)));
    //     }
    // }

    // if (part === "bottoms" || part === "all") {
    //     if (dome_type === "1v") {
    //         parts.push(translate([inset_depth * 4, 0, 0], createHub(params, dome_type)));
    //     } else {
    //         parts.push(translate([inset_depth * 4, inset_depth * 2, 0], createHub(params, dome_type)));
    //         parts.push(translate([0, inset_depth * 4, 0], createHub(params, dome_type)));
    //     }
    // }

    return parts;
}

module.exports = { main, getParameterDefinitions }; 