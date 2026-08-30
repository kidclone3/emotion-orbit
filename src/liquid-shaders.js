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
    vec3 field = vec3(0.0);
    field += waveSample(coordinate, vec2(0.940, 0.342), 1.42, 0.50, time * 0.055 + seedPhase);
    field += waveSample(coordinate, vec2(-0.280, 0.960), 2.08, 0.30, -time * 0.043 + seedPhase * 1.70);
    field += waveSample(coordinate, vec2(0.720, 0.694), 0.92, 0.22, time * 0.030 + seedPhase * 0.61);
    field += waveSample(coordinate, vec2(0.410, -0.912), 3.36, 0.11, -time * 0.062 + seedPhase * 2.10);
    field += waveSample(coordinate, vec2(0.993, -0.120), 4.72, 0.055, time * 0.040 - seedPhase * 0.70);
    float depthScale = mix(0.78, 1.18, smoothstep(0.20, 1.80, uFoldDepth));
    return field * depthScale;
  }

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 coordinate = (vUv - 0.5) * vec2(aspect, 1.0) * 2.0;
    vec3 field = evaluateField(coordinate, uTime);
    float heightValue = sin(field.x * 1.35);
    vec2 shapedGradient = field.yz * cos(field.x * 1.35) * 1.35;
    float normalStrength = mix(0.62, 0.96, smoothstep(0.20, 1.80, uFoldDepth));
    vec3 normalValue = normalize(vec3(-shapedGradient * normalStrength, 1.0));

    vec3 lightDirection = normalize(vec3(-0.46, 0.56, 0.72));
    vec3 halfDirection = normalize(lightDirection + vec3(0.0, 0.0, 1.0));
    float diffuse = smoothstep(-0.18, 0.62, dot(normalValue, lightDirection));
    float slope = clamp(length(normalValue.xy), 0.0, 1.0);
    float roughness = mix(0.22, 0.62, smoothstep(0.10, 0.88, slope));
    float specularPower = mix(12.0, 4.5, roughness);
    float specular = pow(max(dot(normalValue, halfDirection), 0.0), specularPower) * mix(0.88, 0.42, roughness);
    float foldBand = smoothstep(-0.48, 0.48, heightValue + normalValue.x * 0.28);
    float valley = 1.0 - smoothstep(-0.68, -0.04, heightValue);

    vec3 identityA = mix(uPaletteC * 0.12, uPaletteA * 0.56, 0.80);
    vec3 identityB = mix(uPaletteC * 0.14, uPaletteB * 0.60, 0.82);
    vec3 albedo = mix(identityA, identityB, foldBand);
    albedo *= mix(1.0, 0.14, valley);

    vec3 color = albedo * (0.14 + diffuse * 0.72);
    color += mix(uPaletteA, uPaletteB, smoothstep(-0.18, 0.76, heightValue)) * specular * (0.82 + uEnergy * 0.08);
    color += uGlow * uPulse * (0.025 + specular * 0.08);

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
    uCenter: { value: new THREE.Vector2(0.68, 0.68) },
    uGlow: { value: new THREE.Color('#7367ff') },
    uEnergy: { value: 0.72 },
    uLensStrength: { value: 0.94 },
    uLensShape: { value: 0.18 },
    uPulse: { value: 0 },
  },
  vertexShader: fullscreenVertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;

    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform vec3 uGlow;
    uniform float uEnergy;
    uniform float uLensStrength;
    uniform float uLensShape;
    uniform float uPulse;

    void main() {
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 center = uCenter;
      vec2 local = vUv - center;
      float horizontalMetric = mix(aspect, 1.0, smoothstep(1.0, 1.42, aspect));
      vec2 metricLocal = local * vec2(horizontalMetric * (1.0 + uLensShape * 0.08), 1.0 - uLensShape * 0.06);
      float radius = mix(0.58, 0.64, smoothstep(0.72, 1.25, aspect));
      float radial = length(metricLocal) / radius;
      float sphereDepth = sqrt(max(1.0 - min(radial * radial, 1.0), 0.0));
      vec3 sphereNormal = normalize(vec3(metricLocal / radius, sphereDepth));

      float lensMask = 1.0 - smoothstep(0.88, 1.08, radial);
      float refractionStrength = (0.068 + sphereDepth * 0.102 + clamp(uEnergy, 0.0, 1.5) * 0.010 + uPulse * 0.012) * uLensStrength;
      vec2 refractedUv = clamp(vUv + sphereNormal.xy * refractionStrength, vec2(0.002), vec2(0.998));
      vec2 dispersion = sphereNormal.xy * 0.0015 * uLensStrength;

      vec3 baseColor = texture2D(tDiffuse, vUv).rgb;
      vec3 refractedColor = vec3(
        texture2D(tDiffuse, clamp(refractedUv + dispersion, 0.002, 0.998)).r,
        texture2D(tDiffuse, refractedUv).g,
        texture2D(tDiffuse, clamp(refractedUv - dispersion, 0.002, 0.998)).b
      );

      float thickness = sphereDepth * 1.48;
      vec3 absorption = exp(-mix(vec3(0.42), max(vec3(0.08), 1.0 - uGlow), 0.36) * thickness);
      float fresnel = pow(1.0 - clamp(sphereNormal.z, 0.0, 1.0), 4.0);
      vec3 lensColor = refractedColor * absorption * (0.78 + sphereDepth * 0.34);
      lensColor += uGlow * fresnel * (0.16 + uPulse * 0.08);

      float rim = exp(-pow((radial - 0.97) / 0.075, 2.0));
      vec3 color = mix(baseColor, lensColor, lensMask);
      color += uGlow * rim * (0.055 + uPulse * 0.035);
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
      color += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
}
