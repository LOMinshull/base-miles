// Destination data. Climb figures are rounded and vary slightly between sources.
export const FOCUS = [
  ['any', 'Best overall'],
  ['climbs', 'Big climbs'],
  ['sun', 'Winter sun'],
  ['quiet', 'Quiet roads and gravel'],
  ['easy', 'Scenery and food'],
];

export const DESTINATIONS = [
  {
    id: 'mallorca', name: 'Mallorca', country: 'Spain', months: [2, 3, 4, 5, 9, 10], kmDay: 85, gainDay: 1400,
    tags: ['climbs', 'sun', 'easy'], climbs: [['Sa Calobra', 9.5, 7], ['Puig Major', 14, 6]],
    pitch: 'Smooth roads, driver awareness and a mix of flat north-coast miles and the Tramuntana mountains. It is easy to scale each day up or down.',
    logistics: 'Short transfer from Palma. Base in Port de Pollença or Alcúdia. Bike hire is everywhere.',
  },
  {
    id: 'girona', name: 'Girona', country: 'Spain', months: [3, 4, 5, 6, 9, 10], kmDay: 90, gainDay: 1500,
    tags: ['quiet', 'climbs', 'easy'], climbs: [['Rocacorba', 13.5, 6.5], ['Els Àngels', 10, 5]],
    pitch: 'Home to many professional riders, with quiet lanes, volcanic hills, gravel tracks and coffee culture close to the Costa Brava.',
    logistics: 'Girona airport or the high-speed train from Barcelona. Good base for a long weekend.',
  },
  {
    id: 'tenerife', name: 'Tenerife', country: 'Spain', months: [11, 12, 1, 2, 3, 4], kmDay: 80, gainDay: 2200,
    tags: ['climbs', 'sun'], climbs: [['Teide from the south coast', 40, 5.5]],
    pitch: 'Long, steady altitude climbing above the clouds with reliable winter weather. Teams train here for good reason.',
    logistics: 'Stay on the south coast, or at altitude near Teide for the full camp experience. Pack layers for the descents.',
  },
  {
    id: 'grancanaria', name: 'Gran Canaria', country: 'Spain', months: [11, 12, 1, 2, 3, 4], kmDay: 75, gainDay: 1900,
    tags: ['sun', 'climbs', 'quiet'], climbs: [['Pico de las Nieves', 30, 6]],
    pitch: 'Warm all winter, with near-empty mountain roads through the interior and dramatic ravines.',
    logistics: 'Base in Maspalomas or Puerto de Mogán. Most routes start with a climb straight out of the door.',
  },
  {
    id: 'calpe', name: 'Costa Blanca', country: 'Spain', months: [1, 2, 3, 4, 10, 11], kmDay: 90, gainDay: 1300,
    tags: ['sun', 'easy'], climbs: [['Coll de Rates', 6.5, 5]],
    pitch: 'A favourite winter base for pro teams. Mild temperatures, long rideable climbs and plenty of quiet inland roads.',
    logistics: 'Fly to Alicante. Base in Calpe or Dénia.',
  },
  {
    id: 'algarve', name: 'Algarve', country: 'Portugal', months: [11, 12, 1, 2, 3, 4], kmDay: 80, gainDay: 900,
    tags: ['sun', 'quiet', 'easy'], climbs: [['Fóia, Serra de Monchique', 14, 5]],
    pitch: 'Gentle winter riding through quiet hill country behind the coast. A good place to bank easy endurance hours.',
    logistics: 'Fly to Faro. Tavira and Lagos are both good bases.',
  },
  {
    id: 'alps', name: 'Oisans, French Alps', country: 'France', months: [6, 7, 8, 9], kmDay: 75, gainDay: 2300,
    tags: ['climbs'], climbs: [["Alpe d'Huez", 13.8, 8], ['Col du Galibier from Valloire', 18, 7]],
    pitch: 'The Tour de France icons in one valley, with 21 numbered hairpins and passes above 2,000 m.',
    logistics: "Base in Bourg d'Oisans. Fly to Grenoble or Lyon. Check high passes are open before planning June trips.",
  },
  {
    id: 'pyrenees', name: 'Hautes-Pyrénées', country: 'France', months: [6, 7, 8, 9], kmDay: 80, gainDay: 2100,
    tags: ['climbs', 'quiet'], climbs: [['Col du Tourmalet', 17, 7.5], ["Col d'Aubisque", 16.6, 7]],
    pitch: 'Tour history with fewer crowds than the Alps, wilder scenery and an easy-going mountain feel.',
    logistics: 'Fly to Lourdes or Toulouse. Base in Argelès-Gazost or Luz-Saint-Sauveur.',
  },
  {
    id: 'dolomites', name: 'Dolomites', country: 'Italy', months: [6, 7, 8, 9], kmDay: 70, gainDay: 2000,
    tags: ['climbs', 'easy'], climbs: [['Passo Pordoi', 9.2, 7], ['Passo Giau', 10, 9.3]],
    pitch: 'Some of the most beautiful passes anywhere, with the Sella Ronda loop and excellent mountain food.',
    logistics: 'Base in Corvara or Arabba. Fly to Venice or Innsbruck.',
  },
  {
    id: 'stelvio', name: 'Bormio and the Stelvio', country: 'Italy', months: [6, 7, 8, 9], kmDay: 70, gainDay: 2400,
    tags: ['climbs'], climbs: [['Passo dello Stelvio from Prato', 24, 7.4], ['Passo Gavia', 17, 7.5]],
    pitch: 'A bucket-list trip for serious climbers. The Stelvio reaches 2,757 m by way of 48 hairpins.',
    logistics: 'Fly to Milan or Innsbruck. High passes can stay closed into June.',
  },
  {
    id: 'ventoux', name: 'Provence and Mont Ventoux', country: 'France', months: [4, 5, 6, 9, 10], kmDay: 80, gainDay: 1400,
    tags: ['climbs', 'easy', 'quiet'], climbs: [['Mont Ventoux from Bédoin', 21, 7.5]],
    pitch: 'One giant climb surrounded by lavender, vineyards and market towns, so non-climbing days stay relaxed.',
    logistics: 'Base in Bédoin or Vaison-la-Romaine. Fly to Marseille or take the TGV to Avignon.',
  },
  {
    id: 'flanders', name: 'Flanders', country: 'Belgium', months: [4, 5, 6, 7, 8, 9], kmDay: 90, gainDay: 800,
    tags: ['easy'], climbs: [['Oude Kwaremont', 2.2, 4], ['Paterberg', 0.4, 12.5]],
    pitch: 'Short cobbled bergs on the Tour of Flanders roads, followed by a Belgian beer. Hard in short bursts, easy to reach.',
    logistics: 'Base in Oudenaarde. The Centrum Ronde van Vlaanderen museum is a good rest-day stop.',
  },
  {
    id: 'tuscany', name: 'Tuscany', country: 'Italy', months: [4, 5, 6, 9, 10], kmDay: 75, gainDay: 1300,
    tags: ['quiet', 'easy'], climbs: [['Montalcino', 4.5, 5]],
    pitch: 'White gravel roads from Strade Bianche and L\'Eroica, rolling vineyards and hill towns. Superb on wider tyres.',
    logistics: 'Base near Siena or Gaiole in Chianti. Fly to Florence or Pisa.',
  },
  {
    id: 'puglia', name: 'Puglia', country: 'Italy', months: [4, 5, 6, 9, 10], kmDay: 70, gainDay: 500,
    tags: ['easy', 'quiet'], climbs: [],
    pitch: 'Flat to gently rolling roads through olive groves and whitewashed towns. A true holiday where riding is one part of the day.',
    logistics: 'Fly to Bari or Brindisi. Stay around Ostuni or Alberobello.',
  },
  {
    id: 'slovenia', name: 'Julian Alps', country: 'Slovenia', months: [5, 6, 7, 8, 9], kmDay: 75, gainDay: 1600,
    tags: ['climbs', 'quiet'], climbs: [['Vršič Pass', 12, 7.5]],
    pitch: 'Alpine scenery at a smaller scale with quiet roads, cobbled hairpins and turquoise rivers in the Soča valley.',
    logistics: 'Fly to Ljubljana. Base in Kranjska Gora or Bovec.',
  },
  {
    id: 'scotland', name: 'North West Highlands', country: 'Scotland', months: [5, 6, 7, 8, 9], kmDay: 85, gainDay: 1200,
    tags: ['quiet', 'climbs'], climbs: [['Bealach na Bà', 9, 7]],
    pitch: 'Single-track roads and huge empty landscapes. Conditions can be wild, which is part of the appeal.',
    logistics: 'Fly or take the train to Inverness. Book accommodation early around Applecross.',
  },
  {
    id: 'shimanami', name: 'Shimanami Kaido', country: 'Japan', months: [3, 4, 5, 10, 11], kmDay: 60, gainDay: 500,
    tags: ['easy'], climbs: [],
    pitch: 'A roughly 70 km dedicated bike route linking islands by bridge across the Seto Inland Sea. Pairs well with a wider trip to Japan.',
    logistics: 'Start from Onomichi. Rental bikes are widely available and the route is clearly marked.',
  },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthsLabel(months) {
  const sorted = [...months].sort((a, b) => a - b);
  const runs = [];
  for (const m of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === m - 1) last[1] = m; else runs.push([m, m]);
  }
  if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1][1] === 12) {
    const head = runs.shift();
    runs[runs.length - 1][1] = head[1];
  }
  return runs.map(([a, b]) => (a === b ? MONTH_NAMES[a - 1] : `${MONTH_NAMES[a - 1]} to ${MONTH_NAMES[b - 1]}`)).join(', ');
}

const climbGain = c => c[1] * 1000 * c[2] / 100;

export function scoreDestination(d, profile, { focus, month, days }) {
  const reasons = [];
  const cautions = [];
  let score = 50;

  const dailyHours = d.kmDay / Math.max(18, (profile.speed || 24) * 0.92) + d.gainDay / 900;
  const kmRatio = d.kmDay / profile.longKm;
  const gainRatio = d.gainDay / Math.max(profile.longGain, 300);
  const weeklyLoad = dailyHours * Math.min(days, 7) * (days > 4 ? 0.85 : 1);
  const loadRatio = weeklyLoad / Math.max(profile.weeklyHours, 1);

  if (kmRatio <= 1 && gainRatio <= 1) {
    score += 18;
    reasons.push(`A typical ${d.kmDay} km, ${d.gainDay.toLocaleString()} m day sits within your longer rides (${Math.round(profile.longKm)} km and ${Math.round(profile.longGain).toLocaleString()} m), so you could ride back-to-back days and still enjoy them.`);
  } else if (gainRatio <= 1.6 && kmRatio <= 1.3) {
    score += 8;
    reasons.push(`A typical ${d.gainDay.toLocaleString()} m day stretches you beyond your long rides of about ${Math.round(profile.longGain).toLocaleString()} m without being out of reach.`);
  } else {
    score -= 12;
    cautions.push(`Typical days of ${d.gainDay.toLocaleString()} m are well above your long rides of about ${Math.round(profile.longGain).toLocaleString()} m. Build up for this or plan shorter days.`);
  }

  if (loadRatio > 3) {
    score -= 8;
    cautions.push(`${days} days here could mean about ${Math.round(weeklyLoad)} hours, roughly ${loadRatio.toFixed(1)} times your recent ${profile.weeklyHours.toFixed(1)} hours a week. Plan a rest day.`);
  }

  if (d.climbs.length && profile.vam) {
    const [name, km, grade] = [...d.climbs].sort((a, b) => climbGain(b) - climbGain(a))[0];
    const minutes = climbGain([name, km, grade]) / profile.vam * 60;
    const label = minutes >= 90 ? `${(minutes / 60).toFixed(1)} hours` : `${Math.round(minutes)} minutes`;
    reasons.push(`${name} (${km} km at ${grade}%) would take you about ${label} at your usual climbing rate of ${Math.round(profile.vam)} m/h.`);
  } else if (d.climbs.length) {
    const [name, km, grade] = d.climbs[0];
    reasons.push(`${name} is the signature climb at ${km} km and ${grade}%.`);
  }

  const hilly = profile.hilliness >= 12;
  if (d.tags.includes('climbs') && hilly) { score += 6; reasons.push(`You already ride hilly terrain, averaging ${Math.round(profile.hilliness)} m of climbing per km.`); }
  if (d.gainDay / d.kmDay < 12 && !hilly) { score += 6; reasons.push(`The terrain suits how you ride now, at about ${Math.round(profile.hilliness)} m of climbing per km.`); }
  if (d.tags.includes('climbs') && !hilly) { score += 3; reasons.push('Long climbs would be a real change from your mostly flatter riding, and a clear training goal.'); }

  if (focus !== 'any') score += d.tags.includes(focus) ? 22 : -18;
  if (month) {
    if (d.months.includes(month)) score += 12;
    else {
      score -= 30;
      cautions.push(`${MONTH_NAMES[month - 1]} is outside the best window here.`);
    }
  }
  if (days <= 4 && /short|long weekend/i.test(d.logistics)) score += 3;

  const fit = gainRatio <= 1 && kmRatio <= 1 ? 'Comfortable' : gainRatio <= 1.6 && kmRatio <= 1.3 ? 'Good stretch' : 'Big challenge';
  return { ...d, score: Math.max(1, Math.min(99, Math.round(score))), reasons, cautions, fit };
}
