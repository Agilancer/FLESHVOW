// E1M3: Gloom Keep. Overworld & Town pack: a walled town at night, a lava moat and gatehouse, the keep courtyard
// with its ramparts, and the great hall where the Shambler waits in front of the last slipgate.
const SKY = { sky: true, c: 14 };
const YARD = { sky: true, c: 16 };
export default {
  id: 'e1m3', title: 'Gloom Keep', music: 'keep',
  base: { wt: 'tw_rubble' }, ambient: .08, startYaw: 0,
  sky: [.75, .3, .2], skyLight: [.14, .11, .1], torchCol: [1, .6, .3], arch: 'tarch_3',
  legend: {
    '#': 'tw_rubble', R: 'tw_rubble', H: 'tw_timber', B: 'tw_brick', W: 'tw_wattle', S: 'tw_sandstone', C: 'tw_sandstone2', Q: 'tw_planks',
    '.': { f: 0, ...SKY, ft: 'tf_38' },
    ',': { f: 0, ...SKY, ft: 'tf_33' },
    ']': { f: -3, ...SKY, ft: 'tf_16', liquid: 'lava', lh: -1.2, wt: 'tw_rubble2' },
    '/': { f: -3, ...SKY, ft: 'tf_16', liquid: 'lava', lh: -1.2, box: { y0: -.45, y1: 0, t: 'tw_planks2', tt: 'tf_52' } },
    ':': { f: 0, c: 6, ft: 'tf_35', ct: 'tf_36' },
    P: { door: 'kw_fence', trig: 'gate', speed: 1.2 }, G: { button: 'gate', wt: 'tw_timber' },
    '~': { f: 0, ...YARD, ft: 'tf_10' },
    '=': { f: 3, ...YARD, ft: 'tf_36', wt: 'tw_sandstone' },
    L: { f: 0, ...YARD, plat: 3, ft: 'plate', pt: 'plate' },
    '^': { f: .5, ...YARD, ft: 'tf_40', wt: 'tw_sandstone2' },
    Y: { secret: 'tw_sandstone' }, ')': { f: 3, c: 6, ft: 'tf_35', ct: 'tf_36' },
    Z: { door: 'tdoor_3_front', key: 'gold' },
    '&': { f: .5, c: 10, ft: 'tf_35', ct: 'tf_58' },
    J: { door: 'kw_fence', trig: 'boss', speed: 1.5 },
    E: { exit: true, f: .5, c: 4.5, ft: 'tf_37', ct: 'tf_58' },
    '-': { f: .2, c: 4, ft: 'tf_52', ct: 'tf_57' },
    D: { door: 'tdoor_1_front' }, X: { secret: 'tw_timber' },
    '(': { f: .2, c: 3, ft: 'tf_54', ct: 'tf_57' },
  },
  ents: {
    T: { item: 'w_ssg' }, U: { item: 'w_nailgun' }, V: { item: 'w_rocket' }, K: { item: 'w_lightning' }, F: { item: 'key_gold' },
    x: { monster: 'fiend', ambush: 'gold' }, b: { monster: 'shambler', boss: true },
    '¶': { prop: 'kp_grave_lantern', h: 1.7, light: [1, .7, .4, 6, 1.4] },
    'ß': { prop: ['tree_06', 'tree_12', 'tree_18'], h: 6.5, rad: .45 },
    '§': { prop: 'kp_iron_candelabrum', h: 2.1, flame: 1.95, light: [1, .7, .4, 6, 2] },
  },
  map: String.raw`
##################SSSSSSSSSSSSSSSSSSSSSSSSSSS#################
#################Si&&&&&&&&&&&&&&&&&&&&&&&&&iS################
###############SSS&&&&C&&&&C&&&&&&&C&&&&C&&&&S################
###############SEJ&&&&&&*&&&&&mb&&&&&&*&&&&&&S################
###############SEJ&&&p&&&§&&&&&&&&&&&§&&&p&&&S################
###############SSS&&&&C&&&kC&&&&&&&Ck&&&C&&&&S################
#################Si&&&&&&&&&&+&&&+&&&&&&&&&&iS################
#######SSSSSSSSSSSSSSSSSSSSSSSZZZSSSSSSSSSSSSSSSSSSSSSS#######
#######S==~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=FS######
#######S==~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~==S######
#######S==~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~==S######
#######S==~~*~~~~~~~~~~~~~~~~~~w~~~~~~~~~~~~~~~~~~*~~==S######
####SSSS=e~~~~~~~~~~o~~~~~~~~~~~~~~~~~~~~~o~~~~~~~~~~e=S######
####S))S==~~~~p~~~~~~~~~~~~~^^l^l^^~~~~~~~~~~~~~p~~~~==S######
####Sr)Y==~~~~~~~~~~~~~~~~~~^^^K^^^~~~~~~~~~~~~~~~~~~==S######
####S))Y==~~~x~~~~~~~~~~~~~~^^^^^^^~~~~~~~~~~~~~~x~~~==S######
####S))S==~~~~~~~~~~~~~~~~~~^^^^^^^~~~~~~~~~~~~~~~~~~==S######
####SSSSl=~~~~~*~~~~~~~~~w~~~~~~~~~~~w~~~~~~+~~*~~~~~=lS######
#######S==~~~~~~~~f~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~==S######
#######S==~~~~~~~~~~~~~~h~~~~~~x~~~~~~h~~~~~~~~~~~~~~==S######
#######S==LL~~~~~~+~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~LL==S######
#######S==LL~e~~~~~~~~~~~~~~~*~~~*~~~~~~~~~~~~~~~e~LL==S######
#######SSSSSSSSSSSSSSSSSSSSSSSPPPSSSSSSSSSSSSSSSSSSSSSSS######
###RRRRRRRRRRRRRRRRRRRRRRRRRRRi:iRRRRRRRRRRRRRRRRRRRRRRRRRRR##
###R]]]]]]]]]]]]]]]]]]]]]]]]]]///]]]]]]]]]]]]]]]]]]]]]]]]]]R##
###R]]]]]]]]]]]]]]]]]]]]]]]]]]/p/]]]]]]]]]]]]]]]]]]]]]]]]]]R##
###R]]]]]]]]]]]]]]]]]]]]]]]]]]///]]]]]]]]]]]]]]]]]]]]]]]]]]R##
###R]]]]]]]]]]]]]]]]]]]]]]]]]]///]]]]]]]]]]]]]]]]]]]]]]]]]]R##
###R,,,,,,,,,,,,,,,,w,,,,,,,*,,V,,*,,,,,,,w,,,,,,,,,,,,,,,,R##
###R,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,R##
###R,*,,,,,,,,,,,,,....¶..*.........*..¶....,,,,,,,,,,,,,*,R##
###R,,,,,k,,,,,,,,,*...........o...........*,,,,,,,,,,,,,,,R##
###RHHHHHHHHH,BBBB,..HHHH.............WWWW..,,BBBBBB,,WWWWWR##
####Hi------H,BBBB,.ßHHHH......g......WWWWß.,,BBBBBB,,WWWWW###
####H-+---s-H,BBBB,..HHHH.............WWWW..,,BBBBBB,,WWWWW###
####G-------D,BBBB,..HHHH.............WWWW..,,BBBBBB,,WWWWW###
####H-------D,BBBB,..HHHH.............WWWW..,,BBBBBB,,WWWWW###
####H-----T-H,,,,,,.........................,,,,,,,,,,WWWWWR##
####H------iH,,,k,,....s...g.......g...s....,,,,,e,,,,,,,,,R##
###RHHHHHHHHH,WWWW,a........................BB,,,,,,,,,,,,,R##
###R,,,,f,,,,,WWWW,...d...*.........*...d...BB,HHHHDDHHHg,,R##
###R,,,,,,,,,,WWWW,.........................BB,Hi------H,,,R##
###RBBBBBBBB,,WWWW,¶.......................¶BB,H--n----HHHHR##
####BBBBBBBB,,WWWW,..BBBBB...........HHHHH..BB,H----U--H((H###
####BBBBBBBB,,WWWW,..BBBBBn..e...e..nHHHHH..BB,H-y---+-X(uH###
####BBBBBBBB,,,,,,,..BBBBB...........HHHHH..,,,H------iX((H###
####BBBBBBBB,g,,,,,..BBBBB...........HHHHH..,,,HHHHHHHHH((H###
####BBBBBBBB,,,d,,,.+BBBBB..p.....p..HHHHH+.,,,,,,,,,,,,HHHR##
###RBBBBBBBB,,,,,s,*.......ß...@...ß.......*,s,,,,,,,,,,o,,R##
###R,*,,,,,,,,,,,,,.........................,,,,,,,,,,,,,*,R##
###RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR##
##############################################################
`,
};
