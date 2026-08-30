import * as THREE from 'three'

export const fullscreenVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const fluidFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uSeed;
  uniform vec3 uPaletteA;
  uniform vec3 uPaletteB;
  uniform vec3 uPaletteC;
  uniform vec3 uGlow;
  uniform float uEnergy;
  uniform float uFoldDepth;
  uniform float uPulse;
  uniform float uDebug;
  uniform float uBuoyancy;
  uniform float uExpansion;
  uniform float uPulseRate;
  uniform float uSmoothness;
  uniform float uAttraction;
  uniform float uOrbit;
  uniform float uDepth;
  uniform float uPressure;
  uniform float uSharpness;
  uniform float uDownwardDrift;
  uniform float uTrail;

  vec3 waveSample(
    vec2 coordinate,
    vec2 direction,
    float frequency,
    float amplitude,
    float phase
  ) {
    float angle = dot(coordinate, direction) * frequency + phase;
    float heightValue = sin(angle) * amplitude;
    vec2 gradient = cos(angle) * direction * frequency * amplitude;
    return vec3(heightValue, gradient);
  }

  vec3 evaluateField(vec2 coordinate, float time) {
    float seedPhase = mod(abs(uSeed), 64.0) * 0.173;
    float detail = mix(1.0, 0.22, uSmoothness);
    vec2 fieldCoordinate = coordinate * mix(1.12, 0.82, uSmoothness);
    vec3 field = vec3(0.0);
    field += waveSample(fieldCoordinate, vec2(0.940, 0.342), 1.42, 0.50, time * 0.055 + seedPhase);
    field += waveSample(fieldCoordinate, vec2(-0.280, 0.960), 2.08, 0.30, -time * 0.043 + seedPhase * 1.70);
    field += waveSample(fieldCoordinate, vec2(0.720, 0.694), 0.92, 0.22, time * 0.030 + seedPhase * 0.61);
    field += waveSample(fieldCoordinate, vec2(0.410, -0.912), 3.36, 0.11 * detail, -time * 0.062 + seedPhase * 2.10);
    field += waveSample(fieldCoordinate, vec2(0.993, -0.120), 4.72, 0.055 * detail, time * 0.040 - seedPhase * 0.70);
    float depthScale = mix(0.78, 1.18, smoothstep(0.20, 1.80, uFoldDepth));
    return field * depthScale;
  }

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 coordinate = (vUv - 0.5) * vec2(aspect, 1.0) * 2.0;
    float orbitAngle = uTime * (0.018 + uOrbit * 0.085);
    mat2 orbitRotation = mat2(cos(orbitAngle), -sin(orbitAngle), sin(orbitAngle), cos(orbitAngle));
    coordinate = orbitRotation * coordinate;
    coordinate.x *= 1.0 + uPressure * 0.34;
    coordinate.y *= mix(1.0, 0.58, uTrail);
    coordinate /= max(uExpansion, 0.72);
    coordinate.y += uTime * (uDownwardDrift * 0.052 - uBuoyancy * 0.036);
    coordinate.x += sin(coordinate.y * 1.45 + uTime * 0.07) * uAttraction * 0.2;
    vec3 field = evaluateField(coordinate, uTime);
    float heightFrequency = mix(1.18, 2.05, uSharpness);
    float heightValue = sin(field.x * heightFrequency);
    vec2 shapedGradient = field.yz * cos(field.x * heightFrequency) * heightFrequency;
    float normalStrength = mix(0.62, 0.96, smoothstep(0.20, 1.80, uFoldDepth));
    vec3 normalValue = normalize(vec3(-shapedGradient * normalStrength, 1.0));

    vec3 lightDirection = normalize(vec3(-0.46, 0.56, 0.72));
    vec3 halfDirection = normalize(lightDirection + vec3(0.0, 0.0, 1.0));
    float diffuse = smoothstep(-0.18, 0.62, dot(normalValue, lightDirection));
    float slope = clamp(length(normalValue.xy), 0.0, 1.0);
    float roughness = mix(0.22, 0.62, smoothstep(0.10, 0.88, slope));
    float specularPower = mix(12.0, 4.5, roughness);
    float specular = pow(max(dot(normalValue, halfDirection), 0.0), specularPower) * mix(0.88, 0.42, roughness);
    float foldBand = smoothstep(
      mix(-0.58, -0.18, uSharpness),
      mix(0.58, 0.18, uSharpness),
      heightValue + normalValue.x * 0.28
    );
    float valley = 1.0 - smoothstep(-0.68 + uPressure * 0.12, -0.04, heightValue);

    vec3 identityA = mix(uPaletteC * 0.12, uPaletteA * 0.56, 0.80);
    vec3 identityB = mix(uPaletteC * 0.14, uPaletteB * 0.60, 0.82);
    vec3 albedo = mix(identityA, identityB, foldBand);
    albedo *= mix(1.0, 0.14, valley);

    float ambientPulse = 0.5 + 0.5 * sin(uTime * (0.5 + uPulseRate * 4.8));
    float pairedWarmth = exp(-abs(abs(coordinate.x) - 0.34) * 7.0) * uAttraction;
    vec3 color = albedo * (0.14 + diffuse * 0.72);
    color += mix(uPaletteA, uPaletteB, smoothstep(-0.18, 0.76, heightValue)) * specular * (0.82 + uEnergy * 0.08);
    color += uGlow * (uPulse * (0.025 + specular * 0.08) + ambientPulse * uPulseRate * 0.018);
    color += mix(uPaletteA, uGlow, 0.5) * pairedWarmth * (0.025 + 0.05 * diffuse);

    if (uDebug > 0.5 && uDebug < 1.5) {
      color = vec3(clamp(heightValue * 0.34 + 0.5, 0.0, 1.0));
    } else if (uDebug >= 1.5 && uDebug < 2.5) {
      color = normalValue * 0.5 + 0.5;
    } else if (uDebug >= 2.5) {
      color = vec3(specular);
    }

    gl_FragColor = vec4(max(color, 0.0), 1.0);
  }
`

export const LensShader = {
  name: 'LiquidLensShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCenter: { value: new THREE.Vector2(0.73, 0.53) },
    uTime: { value: 0 },
    uGlow: { value: new THREE.Color('#7367ff') },
    uEnergy: { value: 0.72 },
    uLensStrength: { value: 0.94 },
    uLensShape: { value: 0.18 },
    uPulse: { value: 0 },
    uExpansion: { value: 1.1 },
    uDepth: { value: 0.96 },
    uPressure: { value: 0.16 },
    uOrbit: { value: 0.94 },
    uBuoyancy: { value: 0.34 },
    uPulseRate: { value: 0.36 },
    uSmoothness: { value: 0.56 },
    uAttraction: { value: 0.22 },
    uSharpness: { value: 0.3 },
    uDownwardDrift: { value: 0.02 },
    uTrail: { value: 0.52 },
    uSatellites: { value: 0.2 },
    uPairing: { value: 0.14 },
    uAperture: { value: 0.98 },
    uShear: { value: 0.12 },
    uWeight: { value: 0.04 },
    uStability: { value: 0.42 },
  },
  vertexShader: fullscreenVertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;

    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform float uTime;
    uniform vec3 uGlow;
    uniform float uEnergy;
    uniform float uLensStrength;
    uniform float uLensShape;
    uniform float uPulse;
    uniform float uExpansion;
    uniform float uDepth;
    uniform float uPressure;
    uniform float uOrbit;
    uniform float uBuoyancy;
    uniform float uPulseRate;
    uniform float uSmoothness;
    uniform float uAttraction;
    uniform float uSharpness;
    uniform float uDownwardDrift;
    uniform float uTrail;
    uniform float uSatellites;
    uniform float uPairing;
    uniform float uAperture;
    uniform float uShear;
    uniform float uWeight;
    uniform float uStability;

    float gaussian(vec2 point, vec2 center, float tightness) {
      vec2 delta = point - center;
      return exp(-dot(delta, delta) * tightness);
    }

    void main() {
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      float landscape = smoothstep(0.62, 1.28, aspect);
      vec2 center = uCenter + vec2(0.0, uBuoyancy * 0.008 - uWeight * 0.052);
      vec2 metricLocal = (vUv - center) * vec2(aspect, 1.0);
      float radius = mix(0.215, 0.315, landscape)
        * mix(0.94, 1.06, smoothstep(0.84, 1.16, uExpansion))
        * (1.0 - uPressure * 0.045);
      vec2 sphereCoordinate = metricLocal / max(radius, 0.001);
      sphereCoordinate *= vec2(1.0 + uLensShape * 0.06, 1.0 - uLensShape * 0.045);

      float pairSignature = smoothstep(0.42, 0.9, max(uPairing, uAttraction));
      float satelliteSignature = smoothstep(0.45, 0.9, uSatellites);
      float apertureSignature = smoothstep(0.42, 0.9, uAperture);
      float shearSignature = smoothstep(0.42, 0.9, uShear);
      float weightSignature = smoothstep(0.5, 0.9, uWeight);
      vec2 topologyCoordinate = sphereCoordinate;
      topologyCoordinate.y *= mix(1.0, 0.74, weightSignature);
      topologyCoordinate.x += weightSignature * 0.055 * (topologyCoordinate.y + 0.25);
      topologyCoordinate.x += topologyCoordinate.y * shearSignature * 0.13;

      float angle = atan(topologyCoordinate.y, topologyCoordinate.x);
      float pulseWave = sin(uTime * (0.9 + uPulseRate * 3.5));
      float outwardPulse = satelliteSignature * (0.022 + uPulse * 0.03) * pulseWave;
      outwardPulse += satelliteSignature * (0.038 + uPulse * 0.018)
        * sin(angle * 8.0 - uTime * 1.6)
        * (0.72 + pulseWave * 0.28);
      float pressureEdge = shearSignature * uPressure * 0.042
        * sin(angle * 7.0 + uTime * (0.8 + uSharpness));
      float weightedDroop = weightSignature * 0.13
        * (1.0 - smoothstep(-1.18, -0.08, topologyCoordinate.y))
        * (1.0 - min(abs(topologyCoordinate.x) * 0.38, 0.68));
      float shapeRadius = 1.0 + outwardPulse + pressureEdge + weightedDroop;

      float lobeOffset = pairSignature * 0.34;
      vec2 leftLobeCoordinate = topologyCoordinate - vec2(-lobeOffset, 0.0);
      vec2 rightLobeCoordinate = topologyCoordinate - vec2(lobeOffset, 0.0);
      float leftLobeDistance = length(leftLobeCoordinate);
      float rightLobeDistance = length(rightLobeCoordinate);
      float lobeBlendWidth = mix(0.001, 0.16, pairSignature);
      float lobeBlend = max(
        lobeBlendWidth - abs(leftLobeDistance - rightLobeDistance),
        0.0
      ) / lobeBlendWidth;
      float pairedDistance = min(leftLobeDistance, rightLobeDistance)
        - lobeBlend * lobeBlend * lobeBlendWidth * 0.25;
      float lobeRadius = mix(1.0, 0.78, pairSignature);
      float pairedRadial = pairedDistance / lobeRadius;
      float circularRadial = length(topologyCoordinate);
      float radial = mix(circularRadial, pairedRadial, pairSignature)
        / max(shapeRadius, 0.72);
      float sphereDepth = sqrt(max(1.0 - min(radial * radial, 1.0), 0.0));
      vec2 radialDirection = normalize(topologyCoordinate + vec2(0.0001));
      vec3 sphereNormal = normalize(vec3(radialDirection * radial, sphereDepth));

      float inside = 1.0 - smoothstep(0.985, 1.01, radial);
      float innerRim = exp(-pow((radial - 0.965) / 0.052, 2.0));
      float outerRim = exp(-pow((radial - 1.015) / 0.07, 2.0));
      float exteriorSeparation = exp(-pow((radial - 1.055) / 0.13, 2.0));

      float refractionStrength = (
        0.026
        + sphereDepth * (0.038 + uDepth * 0.035)
        + clamp(uEnergy, 0.0, 1.5) * 0.006
        + uPulse * 0.008
      ) * uLensStrength * mix(1.0, 0.72, uStability);
      vec2 refractedUv = clamp(
        vUv + sphereNormal.xy * refractionStrength,
        vec2(0.002),
        vec2(0.998)
      );
      vec2 dispersion = sphereNormal.xy * 0.0018 * uLensStrength * (0.55 + uDepth * 0.45);

      vec3 baseColor = texture2D(tDiffuse, vUv).rgb;
      vec3 refractedColor = vec3(
        texture2D(tDiffuse, clamp(refractedUv + dispersion, 0.002, 0.998)).r,
        texture2D(tDiffuse, refractedUv).g,
        texture2D(tDiffuse, clamp(refractedUv - dispersion, 0.002, 0.998)).b
      );

      float thickness = sphereDepth * (1.35 + uDepth * 0.82);
      vec3 absorptionColor = mix(vec3(0.34), max(vec3(0.07), 1.0 - uGlow), 0.42);
      vec3 absorption = exp(-absorptionColor * thickness);
      vec3 lightDirection = normalize(vec3(-0.48, 0.62, 0.82));
      float internalLight = 0.52 + max(dot(sphereNormal, lightDirection), 0.0) * 0.52;
      float fresnel = pow(1.0 - clamp(sphereNormal.z, 0.0, 1.0), 3.2);
      vec3 lensColor = refractedColor * absorption * internalLight;
      lensColor += uGlow * fresnel * (0.22 + uDepth * 0.1 + uPulse * 0.08);
      lensColor += mix(uGlow, vec3(1.0), 0.28) * innerRim * 0.075;

      float leftCore = gaussian(topologyCoordinate, vec2(-0.35, 0.015), 38.0);
      float rightCore = gaussian(topologyCoordinate, vec2(0.35, -0.015), 38.0);
      float coreBridge = exp(-topologyCoordinate.y * topologyCoordinate.y * 82.0)
        * (1.0 - smoothstep(0.12, 0.62, abs(topologyCoordinate.x)));
      float pairedCores = (
        leftCore
        + rightCore
        + coreBridge * 0.9
      ) * pairSignature * inside;
      lensColor += mix(uGlow, vec3(1.0), 0.42) * pairedCores * 0.46;

      float orbitAngle = uTime * (0.16 + uOrbit * 0.22);
      mat2 orbitRotation = mat2(
        cos(orbitAngle), -sin(orbitAngle),
        sin(orbitAngle), cos(orbitAngle)
      );
      vec2 orbitCoordinate = orbitRotation * topologyCoordinate;
      float apertureRadius = length(orbitCoordinate * vec2(1.0, 1.72));
      float apertureRing = exp(-pow((apertureRadius - 0.58) / 0.038, 2.0))
        * apertureSignature;
      float apertureVoid = gaussian(orbitCoordinate, vec2(0.0), 7.5)
        * apertureSignature;
      lensColor *= 1.0 - apertureVoid * 0.34;
      lensColor += mix(uGlow, vec3(0.78, 0.94, 1.0), 0.55) * apertureRing * 0.31;

      float orbitalArc = exp(-pow((
        length(orbitCoordinate * vec2(1.0, 1.55)) - 1.25
      ) / 0.024, 2.0)) * apertureSignature;
      float satellitePulse = 0.76 + 0.24 * sin(uTime * 4.2 + uPulse * 1.7);
      float satellites = (
        gaussian(topologyCoordinate, vec2(1.16, 0.36), 145.0)
        + gaussian(topologyCoordinate, vec2(-0.82, 0.92), 130.0)
        + gaussian(topologyCoordinate, vec2(0.22, -1.24), 155.0)
      ) * satelliteSignature * satellitePulse;

      float lowerGate = 1.0 - smoothstep(-1.08, -0.22, sphereCoordinate.y);
      float downwardTrail = exp(-sphereCoordinate.x * sphereCoordinate.x * 5.0)
        * lowerGate
        * exp(-pow(sphereCoordinate.y + 1.16, 2.0) * 1.25)
        * weightSignature
        * uTrail;
      float afterimage = exp(-pow((
        length((sphereCoordinate - vec2(0.1, -0.52)) * vec2(1.12, 0.62)) - 0.94
      ) / 0.14, 2.0)) * weightSignature;

      vec3 color = baseColor * (1.0 - exteriorSeparation * 0.16);
      color = mix(color, lensColor, inside);
      float directionalPressure = max(
        dot(radialDirection, normalize(vec2(0.88, 0.42))),
        0.0
      );
      color += uGlow * outerRim * (
        0.12
        + fresnel * 0.12
        + shearSignature * directionalPressure * 0.18
        + uPulse * 0.04
      );
      color += mix(uGlow, vec3(1.0), 0.52) * satellites * 0.76;
      color += mix(uGlow, vec3(0.7, 0.9, 1.0), 0.4) * orbitalArc * 0.19;
      color += mix(baseColor, uGlow, 0.72) * downwardTrail * 0.42;
      color += uGlow * afterimage * 0.14;
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
}

export const PresentationShader = {
  name: 'LiquidPresentationShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: fullscreenVertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;

    varying vec2 vUv;
    uniform sampler2D tDiffuse;

    float interleavedGradientNoise(vec2 pixel) {
      return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      vec2 centered = (vUv - 0.5) * vec2(0.86, 1.0);
      float vignette = 1.0 - smoothstep(0.24, 1.08, length(centered));
      color *= mix(0.55, 1.0, vignette);
      color += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) * (1.65 / 255.0);
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
}
