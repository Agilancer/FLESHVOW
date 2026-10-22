// E1M2: The Cathedral of Ash. Cathedral & Graveyard pack: a moonlit graveyard, a mausoleum, the stained-glass nave,
// a flooded crypt down the east stair, and the sanctum behind the altar.
const SKY = { sky: true, c: 10 };
export default {
  id: 'e1m2', title: 'The Cathedral of Ash', music: 'cathedral',
  base: { wt: 'kw_arcade' }, ambient: .08, startYaw: 0,
  sky: [.55, .3, .7], skyLight: [.13, .1, .17], torchCol: [1, .58, .3], arch: 'karch_2',
  lights: [[12.5, 5, 13, [.5, .25, .7], 8], [12.5, 5, 21, [.7, .2, .3], 8], [40.5, 5, 13, [.3, .35, .8], 8], [40.5, 5, 21, [.7, .3, .5], 8], [26.5, 9, 18, [.5, .4, .6], 10]],
  legend: {
    '#': 'kw_arcade', A: 'kw_arcade', L: 'kw_glass', P: 'kw_pillar', M: 'kw_moss2', K: 'kw_moss', S: 'kw_arcade2',
    ';': { f: 0, ...SKY, ft: 'kf_06', wt: 'kw_moss2' },
    ',': { f: 0, ...SKY, ft: 'kf_50' },
    '_': { f: -.8, ...SKY, ft: 'kf_33', wt: 'kw_moss2' },
    '3': { f: 1.5, ...SKY, ft: 'kf_47', wt: 'kw_moss' }, '2': { f: 1, ...SKY, ft: 'kf_47', wt: 'kw_moss' }, '1': { f: .5, ...SKY, ft: 'kf_47', wt: 'kw_moss' },
    '.': { f: .3, c: 4.5, ft: 'kf_16', ct: 'kf_01' },
    '(': { f: .3, c: 3, ft: 'kf_29', ct: 'kf_01' },
    D: { door: 'kdoor_1_front' }, X: { secret: 'kw_moss' }, Q: { secret: 'kw_arcade2' },
    Y: { door: 'kdoor_3_front', key: 'silver' }, Z: { door: 'kdoor_2_front', key: 'gold' },
    '<': { f: .5, c: 7, ft: 'kf_01', ct: 'kf_16' },
    ':': { f: .5, c: 12, ft: 'kf_04', ct: 'kf_16' },
    '=': { f: .5, c: 12, ft: 'kf_17', ct: 'kf_16' },
    U: { f: 1, c: 12, ft: 'kf_23', ct: 'kf_16' }, V: { f: 1, c: 12, ft: 'kf_23', ct: 'kf_16' },
    '^': { f: 1.5, c: 12, ft: 'kf_25', ct: 'kf_16', wt: 'kw_pillar2' },
    '&': { f: 1.5, c: 8, ft: 'kf_24', ct: 'kf_16', trig: 'sanctum' },
    E: { exit: true, f: 1.5, c: 5, ft: 'kf_14', ct: 'kf_16' },
    '4': { f: 0, c: 4.5, ft: 'kf_49', ct: 'kf_16' }, '5': { f: -.5, c: 4, ft: 'kf_49', ct: 'kf_16' }, '6': { f: -1, c: 3.5, ft: 'kf_49', ct: 'kf_16' },
    '7': { f: -1.5, c: 3, ft: 'kf_49', ct: 'kf_16' }, '8': { f: -2, c: 2.5, ft: 'kf_49', ct: 'kf_16' }, '9': { f: -2.5, c: 2, ft: 'kf_49', ct: 'kf_16' },
    '/': { f: -3, c: 1.5, ft: 'kf_49', ct: 'kf_16' },
    '"': { f: -3.5, c: .5, ft: 'kf_47', ct: 'kf_01' },
    '%': { f: -5, c: .5, ft: 'kf_42', ct: 'kf_01', liquid: 'water', lh: -3.8 },
    '$': { f: -3, c: .5, ft: 'kf_21', ct: 'kf_01' },
    ')': { f: -3.5, c: -.5, ft: 'kf_60', ct: 'kf_01' },
  },
  ents: {
    T: { item: 'w_snailgun' }, N: { item: 'key_silver' }, F: { item: 'key_gold' },
    I: { monster: 'knight', ambush: 'silver' }, x: { monster: 'knight', ambush: 'gold' }, q: { monster: 'hellknight', ambush: 'sanctum' },
    '¶': { prop: ['kp_rounded_headstone', 'kp_celtic_cross', 'kp_gothic_marker', 'kp_broken_headstone', 'kp_squat_cross', 'kp_funerary_obelisk'], h: 1.5, rad: .35 },
    'ß': { prop: ['tree_18', 'tree_12', 'tree_06'], h: 7, rad: .45 },
    'Ø': { prop: 'kp_mourning_angel', h: 2.4 },
    '¤': { prop: 'kp_saint_statue', h: 2.8 },
    '§': { prop: 'kp_iron_candelabrum', h: 2.1, flame: 1.95, light: [1, .7, .4, 6, 2] },
    '¥': { prop: 'cp_skull_pyramid', h: 1.1, rad: .5 },
  },
  map: String.raw`
#########################AAAA############################
#####################AAAAAEEAAAAA########################
####################Ai&&&&&&&&&&iA#######################
####################A&&*&&&&&&*&&A#######################
####################A&&&&&&&f&&&&A#######################
####################A&q&&k&&&&&q&A#######################
####################A&p&&&&&&&&+&A#######################
###########LLLLLLLLLLAAAAAZZAAAAALLLLLLLLLL##############
###########L<+<<<<<<<:^*^^h^^^*^:<<<<<<<+<SSSSSSSSS######
###########Li<<<<<<<<:^^^^^^^^^^:<<<<<<<<i456789//S######
###########L<<<<<<<<<:VVVVVVVVVV:<<<<<<<<<456789//S######
###########L<<<<<<<<P:UUUUUUUUUU:P<<<<<<<<SSSSSS""SSSSSS#
###########L<<<<k<<i<:§::====::§:<i<<k<<<<L###i""""""n"S#
###########L<<<<<<<<<::::====::::<<<<<<<<<L##Sp"""""¥"iS#
###########L<<<<<<<<<::::====::::<<<<<<<<<L##S"z""""z""S#
###########L<<<<<<<<P::::====::::P<<<<<<<<L##S"""""""x"S#
###########L<<<<<<<<<::::====::::<<<<<<<<<L##S"""%%%%""S#
###########L<<<<<<<<<::::=w==::::<<<<<<<<<L##S"""%%%%""S#
###########L<<<<e<<<<::::====::::<<<<e<<<<L##Sx""%%%%""S#
###########L<<<<<<<<P::::====::::P<<<<<<<<L##S"""%%%%"iS#
###########L<n<<<<<i<::::====::::<i<<<<<n<L##S"""%%%%""S#
###########L<<<<<<<<<::::====::::<<<<<<<<<L##Sx+"""""""S#
###########L<<<<<<<<<::::====:w::<<<<<<<<<L##S"""""o"$$S#
###########L<<<<<<<<P::::====::::P<<<<<<<<L##S""""z""$FS#
###########L<<k<<<<<<::::====::::<<<<<<k<<L##Si"¥""""$$S#
###########L<<<<<<<<<::::====::::<<<<<<<<<L##S"s""""""pS#
###########Li<<<<<<<<¤:::=y==:::¤<<<<<<<<iL#SSQQSSSSSSS##
###########L<<s<<<<<<::::====::::<<<<<<s<<L#S)mr)S#######
##########MMLLMLLLLLLAAAAAYYAAAAALLLLLLMLLMMMSMMSMMMMM###
##########M;;;;;;;;;;;¶;;*;;*;;¶;;;;;;;;;;;;;¶;;;;;;;M###
##########M;;I¶;;;¶;;;;I;;,,;;I;;;;;¶;;;;¶;;;w;;;;;*;M###
###KKKKKKKM;;s;;_;;;_;;;ß;,,;Ø;;;_;;;;_;;;;;3333333;;M###
###K.j....M;;;;;_;;;_;z;;;,,;;k;;_;;;;_;;;;;3333p33;;M###
#KKK.z...iM;;;;;;;;;;;;;;;,,;;;;;;;;z;;;ß;12333oT33;;M###
Ku(X......D;;,,,,,,,,,,,,,,,;;;;¶;;;;;;¶;;123333333;;M###
K((X.N....D;;;;;;;;;;;;;;;,,;;;;;;;;;;;;;;;;33n3333;;M###
KKKK....ziM;;;;z;;¶;;;;;w;,,;;;z;;;;;d;;;;;;3333333;;M###
###K.j....M;;;;;;;;;;;;;;;,,;;;;;;;;;;;;;;;;;;;;;;;;;M###
###KKKKKKKM;¶;;;;ß;;d;;;;;,,;;,,,,,,,,,,,,,,,,,,,,,,;M###
##########M;;;;;;;;;;;;;;;,,;;;;;;;Ø;;;;;;;;;;;;;;;;;M###
##########M;;;;;_;;;_;;;;;,,;ß;;;;w;;;;;;;;;;;;;;;;+;M###
##########M;;;;;_;;;_;;;;;,,;;;;;;_;;;;_;;;;z;;;;;;;;M###
##########M;+*;;;;z;;;;;;;@,;;;;;;_;;;;_;;;;;;;;;;;*;M###
##########M;;;;¶;;;;;;;¶;;,,;;;¶;;;;¶;;;;;¶;;;;;;;s;;M###
##########MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM###
#########################################################
`,
};
