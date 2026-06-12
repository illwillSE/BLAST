// Help texts shown by the (i) icon on each block, in English and Swedish.
// Keyed by block type; `params` maps param key -> explanation, `notes`
// covers non-knob features. When adding a new block type to the registry,
// add its entry here too (both languages). Missing Swedish entries fall
// back to English; params without an entry fall back to `common`.

export const HELP = {
  en: {
    headings: { controls: 'Controls', notes: 'Good to know' },
    common: {
      wet: 'How much of the effect you hear, mixed against the dry (unprocessed) signal. 0% = effect off, 100% = effect only.',
      wave: 'Waveform shape: sine is pure and smooth, triangle is mellow, square is hollow and buzzy, sawtooth is bright and brassy.',
    },
    blocks: {
      synth: {
        summary: 'Generates a tone from scratch. Shape it with the waveform, pitch, and the attack/decay/sustain/release envelope.',
        params: {
          wave: 'The oscillator shape: sine is pure, triangle mellow, square hollow, sawtooth bright and brassy. pulse is a square with adjustable width; custom lets you draw your own harmonic mix.',
          partials: 'Limits how many harmonics the wave is built from. full is the complete bright wave; lower numbers round it off toward a sine — a softer, more retro tone. (Only for triangle/square/sawtooth.)',
          width: 'The duty cycle of the pulse wave, from thin and nasal to a full square at 0%. Sweep it (e.g. with a separate effect) for the classic PWM shimmer.',
          harmonics: 'Draw your own waveform: each bar is the level of one harmonic (the first is the fundamental). Drag the bars up and down to build a custom timbre.',
          freq: 'The base pitch of the note, in hertz. 220Hz is the A below middle C; lower is deeper, higher is shriller.',
          duration: 'How long the note is held before it starts fading out. The total sound length is roughly Length + Release.',
          attack: 'Time from silence to full volume when the note starts. Very short sounds clicky and percussive; long swells in softly.',
          decay: 'Time to fall from the attack peak down to the sustain level.',
          sustain: 'The volume the note holds while it lasts, relative to the peak. 0% makes a pluck; 100% holds at full volume.',
          release: 'How long the sound takes to fade to silence after the note ends.',
        },
      },
      sample: {
        summary: 'Plays an audio file or microphone recording.',
        params: {
          pitch: 'Shifts the sample pitch in semitones by changing playback speed — pitching down also makes it longer and darker, up shorter and brighter.',
          gain: 'Volume of the sample before it enters the effects chain.',
        },
        notes: [
          'Drop an audio file on the card, or click Browse… to pick one.',
          '● Record captures from your microphone and replaces the current sample.',
          'Drag the highlighted region’s edges on the waveform — only that part plays.',
          '✎ Edit opens the full-size editor: zoom with the mouse wheel, exact in/out points, reverse, normalize, fades, crop and undo.',
        ],
      },
      compressor: {
        summary: 'Automatically evens out volume — squashes loud parts so the whole sound is punchier and denser.',
        params: {
          threshold: 'The volume level where compression kicks in. Anything louder than this gets squashed.',
          ratio: 'How hard loud parts are squashed once over the threshold. 4:1 is gentle glue; 10:1 and up is punchy limiting.',
          attack: 'How fast the compressor clamps down on a loud sound. Slower lets the initial hit punch through before squashing.',
          release: 'How fast the compressor lets go after the loud part passes.',
        },
      },
      gate: {
        summary: 'Silences the signal whenever it falls below a volume threshold — cuts noise, hum and unwanted tails.',
        params: {
          threshold: 'Audio quieter than this is muted. Raise it to chop off background noise or trailing sounds.',
          smoothing: 'How quickly the gate opens and closes. Lower is snappier but can click; higher is smoother.',
        },
      },
      samplenv: {
        summary: 'Uses the loudness contour of an audio sample to shape the source’s volume over time. Record a “pew-pew” or some beatboxing and the synth follows your timing and dynamics.',
        params: {
          amount: 'How strongly the contour shapes the volume. 0% leaves the source untouched; 100% follows the sample exactly.',
          smoothing: 'Softens the contour so it glides instead of jumping. More smoothing rounds off sharp attacks.',
          stretch: 'natural plays the contour at its recorded length (keeping your timing); note squeezes or stretches it to fit the synth’s Length.',
        },
        notes: [
          'Drop or record an audio file on the card — it’s used as modulation data, not played as sound.',
          'Hit ✎ Edit to trim the sample (zoom, exact in/out points) or crop/reverse/normalize — only the trimmed slice shapes the volume.',
          'While it’s active the Synth block’s attack/decay/sustain/release is bypassed — the synth holds a flat, sustained tone and the sample’s contour owns the volume instead. (The ADSR sliders still show their values; they just don’t apply.) Bypass this block to get the normal ADSR back.',
          'It modulates the source, so its position in the chain doesn’t matter.',
        ],
      },
      vocoder: {
        summary: 'Imposes the changing spectrum of a speech sample onto the chain signal — the classic “talking synth / robot voice”. The chain signal is the carrier (use something bright like a sawtooth or noise); the embedded sample is the voice that shapes it.',
        params: {
          bands: 'How many frequency bands the spectrum is split into. More bands track the voice more accurately and sound more intelligible; fewer is coarser and more robotic.',
          response: 'How quickly each band follows the voice’s loudness. Fast catches crisp consonants but can sound buzzy; slow is smoother but smears the words.',
          sibilance: 'Passes the voice’s high hiss (S, T, F sounds) straight through the carrier highs, which the bands alone reproduce poorly. Raise it for clearer speech.',
        },
        notes: [
          'Drop or record the voice/speech sample on the card — it’s the modulator, not played as sound; the chain signal you feed in is what you actually hear.',
          'Hit ✎ Edit to trim the sample (zoom, exact in/out points) or crop/reverse/normalize — only the trimmed slice drives the vocoder.',
          'The voice sample restarts every time you press Play, in sync with the source.',
          'Best results with a sustained, harmonically rich carrier — a held sawtooth or noise. A pure sine has too little to filter and vocodes poorly.',
        ],
      },
      filter: {
        summary: 'Removes part of the frequency range — the classic tool for making sounds darker, thinner or squelchy.',
        params: {
          filterType: 'low-pass keeps lows and cuts highs (darker); high-pass keeps highs and cuts lows (thinner); band-pass keeps only a band around the cutoff.',
          cutoff: 'The frequency where the filter starts cutting.',
          resonance: 'Boosts frequencies right at the cutoff. High values whistle and squelch — sweep the cutoff to hear it.',
        },
      },
      eq: {
        summary: 'Three-band tone control — boost or cut bass, mids and treble independently.',
        params: {
          low: 'Boost or cut the bass — weight and rumble.',
          mid: 'Boost or cut the middle range, where most of a sound’s body lives.',
          high: 'Boost or cut the treble — brightness and air.',
        },
      },
      reverb: {
        summary: 'Simulates a space around the sound, from a small room to a huge hall.',
        params: {
          decay: 'How long the space rings out after the sound stops. Short = closet, long = cathedral.',
          preDelay: 'A small gap between the dry sound and the start of the reverb tail — adds a sense of size and distance.',
        },
      },
      delay: {
        summary: 'Repeating echoes of the sound.',
        params: {
          time: 'The gap between echoes.',
          feedback: 'How much of each echo is fed back in to echo again — higher means more repeats before fading out.',
        },
      },
      pitchshift: {
        summary: 'Shifts the pitch of whatever flows through it, without changing the speed.',
        params: {
          pitch: 'How far the pitch is shifted, in semitones (12 = one octave).',
        },
      },
      detune: {
        summary: 'Mixes in off-pitch copies around the original — thickens the sound like a chorus, or a full supersaw stack at higher counts.',
        params: {
          amount: 'The pitch step between added copies, in cents (100 cents = one semitone). Positive puts the first copy above the original, negative below. Small amounts shimmer; large amounts sound out of tune.',
          count: 'How many extra copies are added — you hear Count + 1 tones in total. Even counts split half above and half below the original; odd counts put the extra one above. Each copy is one Amount step further out.',
        },
      },
      pitchlfo: {
        summary: 'Wobbles the source’s pitch in a cycle — vibrato, sirens, alarms, underwater warbles.',
        params: {
          rate: 'How fast the pitch wobbles, in cycles per second.',
          depth: 'How far the pitch swings away from center, in cents (100 = one semitone). Subtle = vibrato, huge = siren.',
          wave: 'The shape of the wobble: sine is a smooth vibrato, square trills between two pitches, sawtooth ramps and snaps back.',
        },
        notes: [
          'This block changes the source’s pitch rather than processing audio — its position in the chain doesn’t matter.',
        ],
      },
      pitchenv: {
        summary: 'Slides the source’s pitch from one offset to another every time the sound plays — lasers, power-ups, sweeps.',
        params: {
          start: 'Pitch offset at the moment the sound starts, relative to the base pitch (in cents; 1200 = one octave).',
          end: 'The pitch offset the slide ends at.',
          time: 'How long the slide takes. Sliding up = power-up; sliding down = laser or falling bomb.',
        },
        notes: [
          'This block changes the source’s pitch rather than processing audio — its position in the chain doesn’t matter.',
        ],
      },
      overdrive: {
        summary: 'Pushes the signal into saturation — warm crunch at low drive, snarling distortion at high.',
        params: {
          drive: 'How hard the signal is pushed into the distortion. More = louder, dirtier and more compressed.',
        },
      },
      bitcrusher: {
        summary: 'Reduces digital quality on purpose — the crunchy, noisy sound of retro game hardware.',
        params: {
          bits: 'Bit depth of the audio. 16 is clean; 8 sounds like an old console; below 4 turns into noisy grit.',
        },
      },
      volume: {
        summary: 'Plain level control at this point in the chain — for example to tame the signal before a distortion block.',
        params: {
          volume: 'Gain applied here, in decibels. 0dB = unchanged.',
        },
      },
      pan: {
        summary: 'Places the sound in the stereo field.',
        params: {
          pan: 'Position from full left to full right.',
        },
      },
      analyzer: {
        summary: 'Shows the frequency spectrum of the signal at this point in the chain while the sound plays.',
        notes: [
          'Purely visual — audio passes through unchanged. Place several along the chain to compare before/after an effect.',
        ],
      },
    },
  },

  sv: {
    headings: { controls: 'Kontroller', notes: 'Bra att veta' },
    common: {
      wet: 'Hur mycket av effekten du hör, blandat mot den obehandlade signalen. 0 % = ingen effekt, 100 % = bara effekt.',
      wave: 'Vågform: sinus är ren och mjuk, triangel är dov, fyrkant är ihålig och surrig, sågtand är ljus och vass.',
    },
    blocks: {
      synth: {
        summary: 'Skapar en ton från grunden. Forma den med vågformen, tonhöjden och ADSR-förloppet (attack/decay/sustain/release).',
        params: {
          wave: 'Oscillatorns form: sinus är ren, triangel dov, fyrkant ihålig, sågtand ljus och vass. pulse är en fyrkant med justerbar bredd; custom låter dig rita din egen övertonsmix.',
          partials: 'Begränsar hur många övertoner vågen byggs av. full är hela den ljusa vågen; lägre värden rundar av den mot en sinus — ett mjukare, mer retroaktigt ljud. (Bara för triangel/fyrkant/sågtand.)',
          width: 'Pulsvågens pulskvot, från tunn och nasal till en hel fyrkant vid 0 %. Svep den (t.ex. med en separat effekt) för det klassiska PWM-skimret.',
          harmonics: 'Rita din egen vågform: varje stapel är nivån på en överton (den första är grundtonen). Dra staplarna upp och ner för att bygga en egen klangfärg.',
          freq: 'Tonens grundton i hertz. 220 Hz är A:t under ettstrukna C; lägre är djupare, högre är gällare.',
          duration: 'Hur länge tonen hålls innan den börjar klinga ut. Ljudets totala längd är ungefär Length + Release.',
          attack: 'Tiden från tystnad till full volym när tonen startar. Mycket kort låter klickigt och perkussivt; långt tonar in mjukt.',
          decay: 'Tiden det tar att falla från attackens topp ner till sustain-nivån.',
          sustain: 'Volymen tonen ligger kvar på så länge den varar, i förhållande till toppen. 0 % ger ett knäpp; 100 % håller full volym.',
          release: 'Hur lång tid ljudet tar att tona ut till tystnad när tonen släpps.',
        },
      },
      sample: {
        summary: 'Spelar upp en ljudfil eller en mikrofoninspelning.',
        params: {
          pitch: 'Ändrar samplingens tonhöjd i halvtoner genom att ändra uppspelningshastigheten — neråt blir också längre och mörkare, uppåt kortare och ljusare.',
          gain: 'Samplingens volym innan den går in i effektkedjan.',
        },
        notes: [
          'Släpp en ljudfil på kortet, eller klicka Browse… för att välja en.',
          '● Record spelar in från mikrofonen och ersätter nuvarande sampling.',
          'Dra i den markerade regionens kanter på vågformen — bara den delen spelas upp.',
          '✎ Edit öppnar editorn i fullstorlek: zooma med mushjulet, exakta in/ut-punkter, reverse, normalize, toningar, beskärning och ångra.',
        ],
      },
      compressor: {
        summary: 'Jämnar ut volymen automatiskt — trycker ihop starka partier så att ljudet blir tätare och mer slagkraftigt.',
        params: {
          threshold: 'Volymnivån där kompressionen slår till. Allt som är starkare trycks ihop.',
          ratio: 'Hur hårt starka partier trycks ihop ovanför tröskeln. 4:1 är mjukt lim; 10:1 och uppåt är punchig limitering.',
          attack: 'Hur snabbt kompressorn griper in när ljudet blir starkt. Långsammare släpper igenom den första smällen.',
          release: 'Hur snabbt kompressorn släpper taget när det starka partiet passerat.',
        },
      },
      gate: {
        summary: 'Tystar signalen när den faller under en volymtröskel — tar bort brus, hum och oönskade svansar.',
        params: {
          threshold: 'Ljud som är svagare än så här tystas. Höj för att klippa bort bakgrundsbrus eller utklingningar.',
          smoothing: 'Hur snabbt gaten öppnar och stänger. Lägre är snärtigare men kan klicka; högre är mjukare.',
        },
      },
      samplenv: {
        summary: 'Använder volymkonturen från ett ljudklipp för att forma källans volym över tid. Spela in ett ”pew-pew” eller lite beatboxning så följer synten din timing och dynamik.',
        params: {
          amount: 'Hur starkt konturen formar volymen. 0 % lämnar källan orörd; 100 % följer klippet exakt.',
          smoothing: 'Mjukar upp konturen så att den glider i stället för att hoppa. Mer utjämning rundar av skarpa attacker.',
          stretch: 'natural spelar konturen i sin inspelade längd (behåller din timing); note klämmer ihop eller tänjer den till syntens Length.',
        },
        notes: [
          'Släpp eller spela in en ljudfil på kortet — den används som modulationsdata, inte som ljud.',
          'Tryck på ✎ Edit för att trimma klippet (zooma, exakta in-/utpunkter) eller crop/reverse/normalize — bara den trimmade biten formar volymen.',
          'Medan det är aktivt kopplas Synt-blockets attack/decay/sustain/release förbi — synten håller en platt, utdragen ton och klippets kontur formar volymen i stället. (ADSR-reglagen visar fortfarande sina värden; de påverkar bara inte.) Bypassa det här blocket för att få tillbaka den vanliga ADSR:en.',
          'Det modulerar källan, så dess plats i kedjan spelar ingen roll.',
        ],
      },
      vocoder: {
        summary: 'Lägger talklippets föränderliga spektrum ovanpå kedjans signal — den klassiska ”pratande synten / robotrösten”. Kedjans signal är bäraren (använd något ljust som en sågtand eller brus); det inbäddade klippet är rösten som formar den.',
        params: {
          bands: 'Hur många frekvensband spektrumet delas upp i. Fler band följer rösten noggrannare och låter tydligare; färre är grövre och mer robotaktigt.',
          response: 'Hur snabbt varje band följer röstens volym. Snabbt fångar skarpa konsonanter men kan låta surrigt; långsamt är mjukare men smetar ut orden.',
          sibilance: 'Släpper igenom röstens väsljud (S-, T-, F-ljud) rakt genom bärarens diskant, som banden själva återger dåligt. Höj för tydligare tal.',
        },
        notes: [
          'Släpp eller spela in röst-/talklippet på kortet — det är modulatorn, spelas inte som ljud; det är kedjans signal du faktiskt hör.',
          'Tryck på ✎ Edit för att trimma klippet (zooma, exakta in-/utpunkter) eller crop/reverse/normalize — bara den trimmade biten styr vocodern.',
          'Röstklippet startar om varje gång du trycker Play, i takt med källan.',
          'Bäst resultat med en utdragen, övertonsrik bärare — en hållen sågtand eller brus. En ren sinus har för lite att filtrera och vocodar dåligt.',
        ],
      },
      filter: {
        summary: 'Tar bort en del av frekvensområdet — det klassiska verktyget för att göra ljud mörkare, tunnare eller kvackigare.',
        params: {
          filterType: 'low-pass behåller basen och skär diskanten (mörkare); high-pass gör tvärtom (tunnare); band-pass behåller bara ett band runt cutoff-frekvensen.',
          cutoff: 'Frekvensen där filtret börjar skära.',
          resonance: 'Förstärker frekvenserna precis vid cutoff. Höga värden visslar och kvackar — svep cutoff för att höra det.',
        },
      },
      eq: {
        summary: 'Tonkontroll i tre band — höj eller sänk bas, mellanregister och diskant var för sig.',
        params: {
          low: 'Höj eller sänk basen — tyngd och mull.',
          mid: 'Höj eller sänk mellanregistret, där det mesta av ett ljuds kropp finns.',
          high: 'Höj eller sänk diskanten — ljusstyrka och luft.',
        },
      },
      reverb: {
        summary: 'Simulerar ett rum runt ljudet, från liten garderob till enorm katedral.',
        params: {
          decay: 'Hur länge rummet klingar efter att ljudet tystnat. Kort = garderob, långt = katedral.',
          preDelay: 'Ett litet glapp mellan det torra ljudet och efterklangens start — ger känsla av storlek och avstånd.',
        },
      },
      delay: {
        summary: 'Upprepade ekon av ljudet.',
        params: {
          time: 'Tiden mellan ekona.',
          feedback: 'Hur mycket av varje eko som matas tillbaka och ekar igen — högre ger fler upprepningar innan det dör ut.',
        },
      },
      pitchshift: {
        summary: 'Skiftar tonhöjden på allt som passerar, utan att ändra hastigheten.',
        params: {
          pitch: 'Hur långt tonhöjden skiftas, i halvtoner (12 = en oktav).',
        },
      },
      detune: {
        summary: 'Blandar in ostämda kopior runt originalet — gör ljudet tjockare som en chorus, eller en hel supersåg-stack på högre antal.',
        params: {
          amount: 'Tonhöjdssteget mellan de tillagda kopiorna, i cent (100 cent = en halvton). Positivt lägger första kopian över originalet, negativt under. Lite ger skimmer; mycket låter ostämt.',
          count: 'Hur många extra kopior som läggs till — du hör Count + 1 toner totalt. Jämna antal delas lika över och under originalet; udda antal lägger den extra över. Varje kopia ligger ett Amount-steg längre ut.',
        },
      },
      pitchlfo: {
        summary: 'Vickar källans tonhöjd i en cykel — vibrato, sirener, larm, undervattenssvaj.',
        params: {
          rate: 'Hur snabbt tonhöjden vickar, i svängningar per sekund.',
          depth: 'Hur långt tonhöjden svänger från mitten, i cent (100 = en halvton). Subtilt = vibrato, enormt = siren.',
          wave: 'Vickningens form: sinus är mjukt vibrato, fyrkant drillar mellan två toner, sågtand glider upp och hoppar tillbaka.',
        },
        notes: [
          'Det här blocket ändrar källans tonhöjd i stället för att bearbeta ljudet — dess plats i kedjan spelar ingen roll.',
        ],
      },
      pitchenv: {
        summary: 'Glider källans tonhöjd från ett läge till ett annat varje gång ljudet spelas — lasrar, power-ups, svep.',
        params: {
          start: 'Tonhöjdsförskjutningen i samma ögonblick ljudet startar, relativt grundtonen (i cent; 1200 = en oktav).',
          end: 'Tonhöjdsförskjutningen som glidningen slutar på.',
          time: 'Hur lång tid glidningen tar. Uppåt = power-up; neråt = laser eller fallande bomb.',
        },
        notes: [
          'Det här blocket ändrar källans tonhöjd i stället för att bearbeta ljudet — dess plats i kedjan spelar ingen roll.',
        ],
      },
      overdrive: {
        summary: 'Pressar signalen in i mättnad — varmt knaster på låg drive, vrålig distorsion på hög.',
        params: {
          drive: 'Hur hårt signalen pressas in i distorsionen. Mer = starkare, smutsigare och mer ihoptryckt.',
        },
      },
      bitcrusher: {
        summary: 'Sänker den digitala kvaliteten med flit — det knastriga, brusiga ljudet av gammal spelhårdvara.',
        params: {
          bits: 'Ljudets bitdjup. 16 är rent; 8 låter som en gammal konsol; under 4 blir det brusigt grus.',
        },
      },
      volume: {
        summary: 'Enkel nivåkontroll på den här punkten i kedjan — till exempel för att tämja signalen före ett distorsionsblock.',
        params: {
          volume: 'Förstärkning här, i decibel. 0 dB = oförändrat.',
        },
      },
      pan: {
        summary: 'Placerar ljudet i stereobilden.',
        params: {
          pan: 'Position från helt vänster till helt höger.',
        },
      },
      analyzer: {
        summary: 'Visar signalens frekvensspektrum på den här punkten i kedjan medan ljudet spelas.',
        notes: [
          'Helt visuellt — ljudet passerar opåverkat. Placera flera längs kedjan för att jämföra före/efter en effekt.',
        ],
      },
    },
  },
}
