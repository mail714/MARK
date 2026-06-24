// Ported from Chimera's CHAIN_NAMES + CHAIN_DOMAINS heuristic with the same
// reviews-threshold logic. Useful when a search target is local hospitality
// (cafes, pubs, restaurants) — large chains drown out the independents and
// aren't realistic prospects for Signet's brands. For schools / golf clubs
// the chain filter is mostly a no-op so we expose a switch on the search row.

const CHAIN_NAMES = [
  "mcdonald's", 'mcdonalds', 'burger king', 'kfc', 'subway', "nando's", 'nandos',
  'wagamama', 'pizza hut', "domino's", 'dominoes', 'papa john', 'five guys',
  'greggs', 'costa', 'starbucks', 'caffe nero', 'pret a manger', 'pret',
  'wetherspoon', 'harvester', 'toby carvery', 'hungry horse', 'sizzling',
  'prezzo', 'frankie & benny', 'zizzi', 'ask italian', 'bella italia',
  'turtle bay', 'las iguanas', 'slug & lettuce', 'pitcher & piano',
  'browns restaurant', 'the ivy', 'côte brasserie', 'cote brasserie',
  'yo! sushi', 'yo sushi', 'itsu', 'leon restaurant', 'leon ',
  'pizza express', 'pizzaexpress', 'chimichanga', 'chiquito',
  'greene king', 'marstons', "marston's", 'ember inns', 'vintage inns',
  'miller & carter', 'stonehouse', "nicholson's", 'nicholsons',
  'premier inn', 'travelodge', 'ibis ', 'holiday inn', 'hilton ',
  'oyo ', 'cosmo ', 'buffet king', 'all you can eat',
];

const CHAIN_DOMAINS = [
  'mcdonalds.com', 'burgerking.co.uk', 'kfc.com', 'subway.com',
  'nandos.com', 'wagamama.com', 'pizzahut.co.uk', 'dominoes.co.uk',
  'dominos.co.uk', 'papajohns.co.uk', 'fiveguys.co.uk', 'greggs.co.uk',
  'costa.co.uk', 'starbucks.com', 'caffenero.com', 'pret.co.uk',
  'jdwetherspoon.co.uk', 'jdwetherspoon.com', 'harvester.co.uk',
  'tobycarvery.co.uk', 'hungryhorse.co.uk', 'sizzlingpubs.co.uk',
  'prezzo.co.uk', 'frankieandbennys.com', 'zizzi.co.uk', 'askitalian.co.uk',
  'bellaitalia.co.uk', 'turtlebay.co.uk', 'iguanas.co.uk',
  'slugandlettuce.co.uk', 'pitcherandpiano.com', 'browns-restaurants.co.uk',
  'ivycollection.com', 'cotebrasserie.co.uk', 'yosushi.com', 'itsu.com',
  'leon.co.uk', 'pizzaexpress.com', 'chimichanga.co.uk', 'chiquito.co.uk',
  'greeneking.co.uk', 'marstons.co.uk', 'emberinns.co.uk',
  'millerandcarter.co.uk', 'stonehouserestaurants.co.uk', 'nicholsonspubs.co.uk',
  'premierinn.com', 'travelodge.co.uk', 'ibis.com', 'holidayinn.com',
  'hilton.com', 'oyorooms.com',
];

export function classifyChain(
  name: string,
  website: string | null,
  reviews: number | null,
): { isChain: boolean; reason: string } {
  const nameLower = name.toLowerCase();
  const websiteLower = (website ?? '').toLowerCase();
  const nameMatch = CHAIN_NAMES.some((c) => nameLower.includes(c));
  const domainMatch = CHAIN_DOMAINS.some((d) => websiteLower.includes(d));
  const r = reviews ?? 0;

  if (r >= 500 && (nameMatch || domainMatch)) {
    return { isChain: true, reason: 'chain name/domain + high reviews' };
  }
  if (nameMatch) return { isChain: true, reason: 'chain name match' };
  if (domainMatch) return { isChain: true, reason: 'chain domain match' };
  return { isChain: false, reason: '' };
}
