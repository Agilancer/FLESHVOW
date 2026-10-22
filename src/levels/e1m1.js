// E1M1: The Drowned Crypt. Catacombs pack: crypt ashlar, ossuary niches, the drowned crypt, the sealed cells.
// Map key: geometry chars come from `legend`; entity chars (monsters, items, torches) take the floor of a neighbour.
export default {
  id: 'e1m1', title: 'The Drowned Crypt', music: 'crypt',
  base: { wt: 'cw_ashlar' },
  ambient: .09, startYaw: 0,
  torchCol: [1, .6, .3],
  legend: {
    '#': 'cw_ashlar', K: 'cw_ashlar2', O: 'cw_ossuary', C: 'cw_chapel', N: 'cw_niche', W: 'cw_drowned', G: 'cw_grate', R: 'cw_rust', S: 'cw_slit',
    '.': { f: 0, c: 4.5, ft: 'cf_06', ct: 'cf_09' },
    ',': { f: 0, c: 3.5, ft: 'cf_02', ct: 'cf_09' },
    ':': { f: 0, c: 9, ft: 'cf_01', ct: 'cf_09' },
    '-': { f: 1, c: 9, ft: 'cf_02', ct: 'cf_09', wt: 'cw_ashlar2' },
    '1': { f: .5, c: 9, ft: 'cf_02', ct: 'cf_09', wt: 'cw_ashlar2' },
    '~': { f: -2, c: 9, ft: 'cf_59', ct: 'cf_09', liquid: 'water', lh: -.5, wt: 'cw_drowned' },
    '=': { f: -2, c: 9, ft: 'cf_59', ct: 'cf_09', liquid: 'water', lh: -.5, wt: 'cw_drowned', box: { y0: -.35, y1: 0, t: 'plate', tt: 'cf_34' } },
    D: { door: 'cdoor_1_front' }, Y: { door: 'cdoor_2_front', key: 'silver' }, Z: { door: 'cdoor_3_front', key: 'gold' },
    P: { door: 'cw_grate', trig: 'gate1', speed: 1.5 }, B: { button: 'gate1', wt: 'cw_rust' }, X: { secret: 'cw_ossuary' },
    Q: { deco: true, f: 0, c: 4.5, ft: 'cf_13', ct: 'cf_09' },
    E: { exit: true, f: 1, c: 5, ft: 'cf_13', ct: 'cf_09' },
    '&': { f: 0, c: 5, ft: 'cf_05', ct: 'cf_09' },
    '%': { f: -3, c: 5, ft: 'cf_59', ct: 'cf_09', liquid: 'water', lh: -.4, wt: 'cw_drowned' },
    '$': { f: .8, c: 5, ft: 'cf_17', ct: 'cf_09', wt: 'cw_drowned2' },
    '^': { f: -3, c: -1.3, ft: 'cf_59', ct: 'cf_59', liquid: 'water', lh: -.4 },
    '(': { f: 0, c: 2.6, ft: 'cf_14', ct: 'cf_09', secretArea: true },
    '"': { f: 0, c: 4, ft: 'cf_04', ct: 'cf_09' },
    '|': { f: 1.5, c: 4, ft: 'cf_26', ct: 'cf_09', wt: 'cw_ossuary' },
    '?': { f: 1, c: 4, ft: 'cf_03', ct: 'cf_09', wt: 'cw_ossuary' },
    '!': { f: .5, c: 4, ft: 'cf_03', ct: 'cf_09', wt: 'cw_ossuary' },
    _: { f: 1, c: 8, ft: 'cf_36', ct: 'cf_09' },
    "'": { f: 1.5, c: 8, ft: 'cf_21', ct: 'cf_09', wt: 'cw_chapel' },
    L: { f: -4, c: 4.5, plat: 1, ft: 'plate', pt: 'plate', ct: 'cf_09' },
    '0': { f: -4, c: .5, ft: 'cf_54', ct: 'cf_09' },
    '7': { f: -5.5, c: .5, ft: 'cf_59', ct: 'cf_09', liquid: 'slime', lh: -4.6, wt: 'cw_rust' },
    '[': { f: 1, c: 9, ft: 'cf_29', ct: 'cf_09' },
    ']': { f: -2, c: 9, ft: 'cf_59', ct: 'cf_09', liquid: 'lava', lh: -.6, wt: 'cw_slit' },
    '{': { f: 1.6, c: 9, ft: 'cf_60', ct: 'cf_09', wt: 'cw_slit' },
    '/': { f: -2, c: 9, ft: 'cf_59', ct: 'cf_09', liquid: 'lava', lh: -.6, box: { y0: .6, y1: 1, t: 'plate', tt: 'cf_34' } },
  },
  ents: {
    T: { item: 'w_ssg' }, U: { item: 'w_nailgun' }, H: { item: 'w_grenade' }, J: { item: 'w_rocket', trig: 'rl' },
    M: { item: 'key_silver' }, F: { item: 'key_gold' },
    I: { monster: 'knight', ambush: 'silver' }, x: { monster: 'grunt', ambush: 'gold' },
    V: { monster: 'ogre', ambush: 'rl' }, v: { monster: 'knight', ambush: 'rl' }, q: { monster: 'enforcer', ambush: 'rl' },
    '§': { prop: 'cp_iron_candelabrum', h: 2.1, flame: 1.95, light: [1, .7, .4, 6, 2] },
    '¤': { prop: 'cp_kneeling_mourner', h: 1.7 },
    '¥': { prop: 'cp_skull_pyramid', h: 1.1, rad: .5 },
  },
  map: String.raw`
###################################RRRRRRRBRRRRRRRRRR#
##SSSSSSSSSSSSSSSNNNNNNNNNNNNNNNNNNR00x00e0n0g0iG000+#
##S[[[[[[[[[[d[[[N_¤___§'Un'§___¤_RRi00777777000P000iR
##SiV[[[[[[[[[[qiNi_____''''__s__iLL000777777000P00F0R
##S[[]]]]]]]]]][[N_k____*__*______LL000g777770z0P0000R
#SS[[]]]p{{{]]][[Z___C________C___RR0zx00000000nG0000R
#SE[[]]]{J{{///[[Z________________NRRRRRRRRRRRRRRRRRRR
#SE[[]]]{{{p///[[N__________g___k_N##########OOOOOOO##
#SS[[]]]]]]]]]][[N___C___e____C___N#######OOOO"""""O##
##S[v[[[[[[[[[[v[Si+_____________iN#######O"¥"|s||"O##
##Si[[d[[[[[[[[[iN________________N#######O"""||M|"O##
###SSSSSSSSSSSSSKKNNNNNNNYYNNNNNNNKKKKK###O"I"||||"O##
#############K---------*----*---------K###O"""????iO##
#############K--g--§------------§--g--K###O"I"s!!!"O##
#############Ki::::11::::11::::11::::i#####i"""""""O##
##WWWWWWWWWWWK::::K:::K::::::K:::K::::D,,,,""""""""O##
##W$s$&&&&&&&K::::i:::::::::di::::::::D,g,,""""""k"O##
##W$T$&&&&&d&Ws::::::::::::::::::::::s#####""O""O""O##
##W$$$&&&&&&&W~~~~~~~~~~~==~~~~~~~~~~~W###O""O""O""OOO
##W&&&&&&&&&&W~~~~~~~~~~~==~~~~~~~~~~~W###O""O""O""O"O
##Wi&&&&&&&&&K::::::::::::::::::::::::K###O"zO""O""XyO
##W&&W&&&&W&&K::::i:::::d::::::::i::::K###O""O""O""Xm#
##W&z&&&&&&z&D::::K:::K::::::K:::K::::K###O""O"zO""Oj#
##W&&&&&&&&&&D::::::::::::::::::::::::K###Ok"O""O""O##
##W&&&%%%%%&&#i:::::g:::::a::::g:::::iK###O""O""OI"O##
##W&&&%%%%%&&K:¥::::::::::::::::::::¥:K###O"i"""""iO##
##W&&&%%%%%&&K::::::::::::::::::::::::K###OOOOOOOOO###
##W&&&%%%%%&iWKKKKKKKKKKKi,KKKKKKKKKKKK###############
##Wi&&%%%%%&&W###########,,###########################
##W&z&%%%%%&&W###########,,###########################
##W¥&&%%%%%&&W###########,,###########################
###WWWWW^WWWWW###########DD###########################
#######W^W############i......i########################
######WW^WW###########........########################
######W%%%W###########...@....########################
######W(((W###########........########################
######W(H*W###########i+....+i########################
######WWW#############........########################
#########################QQ###########################
######################################################

`,
  // camera keyframes for the opening cinematic, in cell units (x, height in metres, z)
  intro: {
    hall: [[25.5, 7.5, 13], [25.5, 3, 25], [26, 7.8, 14]],
  },
};
