/**
 * @file params.ts
 * @brief Material-vector offsets and parameter units.
 * @details Material-vector offsets. Lengths are points and angles are
 * radians; DARK_OFFSET and DARK_HEIGHT use device pixels.
 */

/** @brief Vector offset for `backdropScale`. */
export const P_SCALE = 0;
/** @brief Vector offset for `blur.radius`. */
export const P_BLUR = 1;
/** @brief Vector offset for `blur.opacities[0]`. */
export const P_BLUR_OP0 = 2;
/** @brief Vector offset for `blur.opacities[1]`. */
export const P_BLUR_OP1 = 3;
/** @brief Vector offset for `blur.opacities[2]`. */
export const P_BLUR_OP2 = 4;
/** @brief Vector offset for `blur.opacities[3]`. */
export const P_BLUR_OP3 = 5;
/** @brief Vector offset for `blur.distances[0]`. */
export const P_BLUR_D0 = 6;
/** @brief Vector offset for `blur.distances[1]`. */
export const P_BLUR_D1 = 7;
/** @brief Vector offset for `blur.distances[2]`. */
export const P_BLUR_D2 = 8;
/** @brief Vector offset for `blur.distances[3]`. */
export const P_BLUR_D3 = 9;
/** @brief Vector offset for `blurFill.blurRadius`. */
export const P_FILL_BLUR = 10;
/** @brief Vector offset for `blurFill.darkenOpacity`. */
export const P_FILL_DARKEN = 11;
/** @brief Vector offset for `blurFill.lightenOpacity`. */
export const P_FILL_LIGHTEN = 12;
/** @brief Vector offset for `blurFill.normalOpacity`. */
export const P_FILL_NORMAL = 13;
/** @brief Vector offset for `refraction.innerAmount`. */
export const P_IN_AMOUNT = 14;
/** @brief Vector offset for `refraction.innerHeight`. */
export const P_IN_HEIGHT = 15;
/** @brief Vector offset for `refraction.outerAmount`. */
export const P_OUT_AMOUNT = 16;
/** @brief Vector offset for `refraction.outerHeight`. */
export const P_OUT_HEIGHT = 17;
/** @brief Vector offset for `refraction.outerOpacity`. */
export const P_OUT_OPACITY = 18;
/** @brief Vector offset for `refraction.outerDistances[0]`. */
export const P_OUT_D0 = 19;
/** @brief Vector offset for `refraction.outerDistances[1]`. */
export const P_OUT_D1 = 20;
/** @brief Vector offset for `faceEffects.opacity`. */
export const P_FACE_OPACITY = 21;
/** @brief Vector offset for `faceEffects.ycc.white`. */
export const P_FACE_WHITE = 22;
/** @brief Vector offset for `faceEffects.ycc.black`. */
export const P_FACE_BLACK = 23;
/** @brief Vector offset for `faceEffects.ycc.saturation`. */
export const P_FACE_SAT = 24;
/** @brief Vector offset for `faceEffects.ycc.normalFill r`. */
export const P_FACE_FILL_R = 25;
/** @brief Vector offset for `faceEffects.ycc.normalFill g`. */
export const P_FACE_FILL_G = 26;
/** @brief Vector offset for `faceEffects.ycc.normalFill b`. */
export const P_FACE_FILL_B = 27;
/** @brief Vector offset for `faceEffects.ycc.normalFill a`. */
export const P_FACE_FILL_A = 28;
/** @brief Vector offset for `faceEffects.maxLuminance`. */
export const P_FACE_LUMA = 29;
/** @brief Vector offset for `faceEffects.maxLuminanceSDR`. */
export const P_FACE_LUMA_SDR = 30;
/** @brief Vector offset for `edgeBleed.amount`. */
export const P_BLEED_AMOUNT = 31;
/** @brief Vector offset for `edgeBleed.height`. */
export const P_BLEED_HEIGHT = 32;
/** @brief Vector offset for `edgeBleed.blurRadius`. */
export const P_BLEED_BLUR = 33;
/** @brief Vector offset for `edgeBleed.opacity`. */
export const P_BLEED_OPACITY = 34;
/** @brief Vector offset for `edgeBleed.distances[0]`. */
export const P_BLEED_D0 = 35;
/** @brief Vector offset for `edgeBleed.distances[1]`. */
export const P_BLEED_D1 = 36;
/** @brief Vector offset for `edgeBleed.useDarkenBlending`. */
export const P_BLEED_DARKEN = 37;
/** @brief Vector offset for `edgeBleed.ycc.white`. */
export const P_BLEED_WHITE = 38;
/** @brief Vector offset for `edgeBleed.ycc.black`. */
export const P_BLEED_BLACK = 39;
/** @brief Vector offset for `edgeBleed.ycc.saturation`. */
export const P_BLEED_SAT = 40;
/** @brief Vector offset for `shadow.opacity`. */
export const P_SHADOW_OPACITY = 41;
/** @brief Vector offset for `shadow.shadowRadius`. */
export const P_SHADOW_RADIUS = 42;
/** @brief Vector offset for `shadow.offset[0]`. */
export const P_SHADOW_X = 43;
/** @brief Vector offset for `shadow.offset[1]`. */
export const P_SHADOW_Y = 44;
/** @brief Vector offset for `shadow.amount`. */
export const P_SHADOW_AMOUNT = 45;
/** @brief Vector offset for `shadow.height`. */
export const P_SHADOW_HEIGHT = 46;
/** @brief Vector offset for `shadow.inset`. */
export const P_SHADOW_INSET = 47;
/** @brief Vector offset for `shadow.blurRadius`. */
export const P_SHADOW_BLUR = 48;
/** @brief Vector offset for `shadow.vibrancyContribution`. */
export const P_SHADOW_VIBRANCY = 49;
/** @brief Vector offset for `shadow.ycc.white`. */
export const P_SHADOW_WHITE = 50;
/** @brief Vector offset for `shadow.ycc.black`. */
export const P_SHADOW_BLACK = 51;
/** @brief Vector offset for `shadow.ycc.saturation`. */
export const P_SHADOW_SAT = 52;
/** @brief Vector offset for `shadow.ycc.normalFill r`. */
export const P_SHADOW_FILL_R = 53;
/** @brief Vector offset for `shadow.ycc.normalFill g`. */
export const P_SHADOW_FILL_G = 54;
/** @brief Vector offset for `shadow.ycc.normalFill b`. */
export const P_SHADOW_FILL_B = 55;
/** @brief Vector offset for `shadow.ycc.normalFill a`. */
export const P_SHADOW_FILL_A = 56;
/** @brief Vector offset for `ringShadow.opacity`. */
export const P_RING_OPACITY = 57;
/** @brief Vector offset for `ringShadow.blurRadius`. */
export const P_RING_BLUR = 58;
/** @brief Vector offset for `ringShadow.strokeWidth`. */
export const P_RING_WIDTH = 59;
/** @brief Vector offset for `ringShadow.verticalOffset`. */
export const P_RING_OFFSET = 60;
/** @brief Vector offset for `ringShadow.maskAmount`. */
export const P_RING_MASK = 61;
/** @brief Vector offset for `darkSpecular.amount`. */
export const P_DARK_AMOUNT = 62;
/** @brief Vector offset for `darkSpecular.angle (radians)`. */
export const P_DARK_ANGLE = 63;
/** @brief Vector offset for `darkSpecular.colorBias`. */
export const P_DARK_BIAS = 64;
/** @brief Vector offset for `darkSpecular.effectOffset`. */
export const P_DARK_OFFSET = 65;
/** @brief Vector offset for `darkSpecular.height`. */
export const P_DARK_HEIGHT = 66;
/** @brief Vector offset for `darkSpecular.spread (radians)`. */
export const P_DARK_SPREAD = 67;
/** @brief Vector offset for `darkSpecular.spreadSDR (radians)`. */
export const P_DARK_SPREAD_SDR = 68;
/** @brief Vector offset for `highlights.key.amount`. */
export const P_KEY_AMOUNT = 69;
/** @brief Vector offset for `highlights.key.curvature`. */
export const P_KEY_CURVATURE = 70;
/** @brief Vector offset for `highlights.key.height`. */
export const P_KEY_HEIGHT = 71;
/** @brief Vector offset for `highlights.key.opacity`. */
export const P_KEY_OPACITY = 72;
/** @brief Vector offset for `highlights.key.spread (radians)`. */
export const P_KEY_SPREAD = 73;
/** @brief Vector offset for `highlights.key.offset (radians)`. */
export const P_KEY_OFFSET = 74;
/** @brief Vector offset for `highlights.key.ycc.white`. */
export const P_KEY_WHITE = 75;
/** @brief Vector offset for `highlights.key.ycc.black`. */
export const P_KEY_BLACK = 76;
/** @brief Vector offset for `highlights.key.ycc.saturation`. */
export const P_KEY_SAT = 77;
/** @brief Vector offset for `highlights.key.ycc.dodgeFill r`. */
export const P_KEY_DODGE_R = 78;
/** @brief Vector offset for `highlights.key.ycc.dodgeFill g`. */
export const P_KEY_DODGE_G = 79;
/** @brief Vector offset for `highlights.key.ycc.dodgeFill b`. */
export const P_KEY_DODGE_B = 80;
/** @brief Vector offset for `highlights.key.ycc.dodgeFill a`. */
export const P_KEY_DODGE_A = 81;
/** @brief Vector offset for `highlights.key.ycc.normalFill r`. */
export const P_KEY_FILL_R = 82;
/** @brief Vector offset for `highlights.key.ycc.normalFill g`. */
export const P_KEY_FILL_G = 83;
/** @brief Vector offset for `highlights.key.ycc.normalFill b`. */
export const P_KEY_FILL_B = 84;
/** @brief Vector offset for `highlights.key.ycc.normalFill a`. */
export const P_KEY_FILL_A = 85;
/** @brief Vector offset for `highlights.fill.amount`. */
export const P_FILL_AMOUNT = 86;
/** @brief Vector offset for `highlights.fill.curvature`. */
export const P_FILL_CURVATURE = 87;
/** @brief Vector offset for `highlights.fill.height`. */
export const P_FILL_HEIGHT = 88;
/** @brief Vector offset for `highlights.fill.opacity`. */
export const P_FILL_OPACITY = 89;
/** @brief Vector offset for `highlights.fill.spread (radians)`. */
export const P_FILL_SPREAD = 90;
/** @brief Vector offset for `highlights.fill.ycc.white`. */
export const P_FILL_WHITE = 91;
/** @brief Vector offset for `highlights.fill.ycc.black`. */
export const P_FILL_BLACK = 92;
/** @brief Vector offset for `highlights.fill.ycc.saturation`. */
export const P_FILL_SAT = 93;
/** @brief Vector offset for `highlights.fill.ycc.dodgeFill r`. */
export const P_FILL_DODGE_R = 94;
/** @brief Vector offset for `highlights.fill.ycc.dodgeFill g`. */
export const P_FILL_DODGE_G = 95;
/** @brief Vector offset for `highlights.fill.ycc.dodgeFill b`. */
export const P_FILL_DODGE_B = 96;
/** @brief Vector offset for `highlights.fill.ycc.dodgeFill a`. */
export const P_FILL_DODGE_A = 97;
/** @brief Vector offset for `highlights.fill.ycc.normalFill r`. */
export const P_FILL_FILL_R = 98;
/** @brief Vector offset for `highlights.fill.ycc.normalFill g`. */
export const P_FILL_FILL_G = 99;
/** @brief Vector offset for `highlights.fill.ycc.normalFill b`. */
export const P_FILL_FILL_B = 100;
/** @brief Vector offset for `highlights.fill.ycc.normalFill a`. */
export const P_FILL_FILL_A = 101;
/** @brief Vector offset for `highlights.diffuse.amountScale`. */
export const P_DIFFUSE_AMOUNT = 102;
/** @brief Vector offset for `highlights.diffuse.heightScale`. */
export const P_DIFFUSE_HEIGHT = 103;
/** @brief Vector offset for `highlights.diffuse.spreadScale`. */
export const P_DIFFUSE_SPREAD = 104;
/** @brief Vector offset for `highlights.inset`. */
export const P_RIM_INSET = 105;
/** @brief Vector offset for `backdropLensing.aberrationAmount`. */
export const P_LENS_AMOUNT = 106;
/** @brief Vector offset for `backdropLensing.aberrationAngle (radians)`. */
export const P_LENS_ANGLE = 107;
/** @brief Vector offset for `backdropLensing.aberrationHeight`. */
export const P_LENS_HEIGHT = 108;
/** @brief Vector offset for `backdropLensing.aberrationInset`. */
export const P_LENS_INSET = 109;
/** @brief Vector offset for `backdropLensing.edgeDistances[0]`. */
export const P_LENS_D0 = 110;
/** @brief Vector offset for `backdropLensing.edgeDistances[1]`. */
export const P_LENS_D1 = 111;
/** @brief Vector offset for `backdropLensing.edgeOpacities[0]`. */
export const P_LENS_OP0 = 112;
/** @brief Vector offset for `backdropLensing.edgeOpacities[1]`. */
export const P_LENS_OP1 = 113;
/** @brief Vector offset for `backdropLensing.refractionAmount`. */
export const P_LENS_REFRACTION = 114;
/** @brief Vector offset for `backdropLensing.refractionHeight`. */
export const P_LENS_REFRACTION_HEIGHT = 115;
/** @brief Vector offset for `backdropLensing.refractionInset`. */
export const P_LENS_REFRACTION_INSET = 116;
/** @brief Vector offset for `derived.backdropMarginWidth`. */
export const P_MARGIN = 117;
/** @brief Vector offset for `Length of the parameter vector.`. */
export const P_COUNT = 118;
/** @brief Vector offset for `Bit i of word i >> 5: value i follows the smallest member of a union (the rest the largest one).`. */
export const P_NEAR = new Int32Array([49216, 0, 0, 1897472]);
