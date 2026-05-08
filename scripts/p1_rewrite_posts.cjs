const fs = require('fs');
const path = require('path');

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const files = fs.readdirSync(postsDir).filter((name) => name.endsWith('.md')).sort((a, b) => a.localeCompare(b));

const acronyms = [
  ['AI', 'Artificial Intelligence', 'software that generates, classifies, predicts, summarizes, or acts on patterns in data'],
  ['API', 'Application Programming Interface', 'a controlled doorway through which software systems exchange data or actions'],
  ['ANN', 'Approximate Nearest Neighbor', 'a search method that finds close matches quickly without checking every item exactly'],
  ['AQI', 'Air Quality Index', 'a public-health number that summarizes pollution risk'],
  ['BA', 'variant lineage naming', 'a branch name used in SARS-CoV-2 variant tracking'],
  ['BPO', 'Business Process Outsourcing', 'office and service work contracted to outside firms'],
  ['CAPTCHA', 'Completely Automated Public Turing test to tell Computers and Humans Apart', 'a challenge meant to separate human users from bots'],
  ['CDA', 'Clinical Document Architecture', 'an older Health Level Seven standard for structured clinical documents'],
  ['CDS', 'Clinical Decision Support', 'software that helps clinicians with alerts, reminders, recommendations, or patient-specific guidance'],
  ['CDW', 'Corporate Data Warehouse', 'the Veterans Affairs enterprise warehouse used for reporting, operations, analytics, and research'],
  ['COBOL', 'Common Business-Oriented Language', 'an older programming language still used in many institutional systems'],
  ['COVID', 'Coronavirus Disease', 'the disease caused by SARS-CoV-2'],
  ['CPT', 'Current Procedural Terminology', 'a United States coding system for medical procedures and services'],
  ['CSS', 'Cascading Style Sheets', 'the web language used to style pages'],
  ['D3', 'Data-Driven Documents', 'a JavaScript library for building data visualizations'],
  ['DW', 'Data Warehouse', 'a database environment built for reporting and analysis rather than daily transactions'],
  ['EHR', 'Electronic Health Record', 'the clinical system where patient care is documented and managed'],
  ['ELT', 'Extract, Load, Transform', 'a data pipeline pattern where raw data is loaded before transformation'],
  ['ETL', 'Extract, Transform, Load', 'a data pipeline pattern for pulling, reshaping, and loading data'],
  ['FHIR', 'Fast Healthcare Interoperability Resources', 'the modern web-friendly Health Level Seven healthcare data exchange standard'],
  ['FORTRAN', 'Formula Translation', 'an older programming language widely used in scientific and numerical computing'],
  ['GDP', 'Gross Domestic Product', 'the total monetary value of goods and services produced in an economy'],
  ['GIS', 'Geographic Information System', 'software and data methods for mapping and spatial analysis'],
  ['GPT', 'Generative Pre-trained Transformer', 'a transformer-based language model family'],
  ['HIE', 'Health Information Exchange', 'the sharing of clinical information across organizations'],
  ['HL7', 'Health Level Seven', 'the family of healthcare messaging and data exchange standards'],
  ['HL7 v2', 'Health Level Seven version 2', 'the older event-message standard still running much hospital integration'],
  ['HNSW', 'Hierarchical Navigable Small World', 'a graph-based indexing method for fast vector search'],
  ['HTML', 'HyperText Markup Language', 'the structural language of web pages'],
  ['HTML5', 'HyperText Markup Language 5', 'the modern generation of HTML used for web applications'],
  ['ICD', 'International Classification of Diseases', 'a diagnosis classification system used for reporting, billing, and statistics'],
  ['ICD-10', 'International Classification of Diseases, Tenth Revision', 'a widely used diagnosis classification system'],
  ['IBM', 'International Business Machines', 'a long-running enterprise technology company'],
  ['IT', 'Information Technology', 'the practice of building, operating, and supporting computing systems'],
  ['LLM', 'Large Language Model', 'a statistical language system trained to generate and interpret text'],
  ['LOINC', 'Logical Observation Identifiers Names and Codes', 'a terminology for lab tests and clinical observations'],
  ['LPG', 'Liquefied Petroleum Gas', 'bottled cooking gas used in many Indian homes'],
  ['MPI', 'Master Patient Index', 'identity logic used to decide whether records refer to the same person'],
  ['MP', 'Member of Parliament', 'an elected political representative'],
  ['MUMPS', 'Massachusetts General Hospital Utility Multi-Programming System', 'an older database and programming environment used in healthcare systems'],
  ['NLP', 'Natural Language Processing', 'software methods for working with human language'],
  ['NRI', 'Non-Resident Indian', 'an Indian citizen or person of Indian origin living outside India'],
  ['OPNET', 'Optimized Network Engineering Tools', 'a network simulation platform used for protocol and system modeling'],
  ['PPE', 'Personal Protective Equipment', 'protective gear used to reduce exposure to hazards'],
  ['RAG', 'Retrieval-Augmented Generation', 'an AI pattern where a model retrieves external evidence before answering'],
  ['REST', 'Representational State Transfer', 'a common web API style built around resources and standard web operations'],
  ['RNA', 'Ribonucleic Acid', 'a molecule central to gene expression and many viruses'],
  ['SARS-CoV-2', 'Severe Acute Respiratory Syndrome Coronavirus 2', 'the virus that causes COVID'],
  ['SAS', 'Statistical Analysis System', 'software used for statistics, data management, and reporting'],
  ['SNOMED CT', 'Systematized Nomenclature of Medicine Clinical Terms', 'a large clinical terminology for representing medical meaning'],
  ['SQL', 'Structured Query Language', 'the language commonly used to query relational databases'],
  ['SPSS', 'Statistical Package for the Social Sciences', 'software used for statistical analysis'],
  ['TTS', 'Text-to-Speech', 'software that reads text aloud'],
  ['UBI', 'Universal Basic Income', 'a policy idea where people receive a regular basic cash payment'],
  ['UML', 'Unified Modeling Language', 'a notation for diagramming software and system designs'],
  ['US', 'United States', 'the United States of America'],
  ['USA', 'United States of America', 'the federal republic in North America'],
  ['USF', 'University of South Florida', 'a public research university in Florida'],
  ['UTHSCSA', 'University of Texas Health Science Center at San Antonio', 'a health science university and research institution in Texas'],
  ['VA', 'Veterans Affairs', 'the United States public healthcare system serving military veterans'],
  ['VBA', 'Visual Basic for Applications', 'a Microsoft scripting language used in Office automation'],
  ['VistA', 'Veterans Health Information Systems and Technology Architecture', 'the long-running Veterans Affairs clinical and administrative software ecosystem'],
  ['Y2K', 'Year 2000 problem', 'the date-handling risk that older software might fail when years rolled from 1999 to 2000']
];

const baseSeoTags = [
  'Suvro Ghosh',
  'SuvroGhosh',
  'Calcutta',
  'Kolkata',
  'Bengali Essay',
  'Indian Middle Class',
  'Lower Middle Class India',
  'Kolkata Bengali Writing',
  'Longform Essay',
  'Personal Blog',
  'Systems Thinking',
  'India',
  'South Asia',
  'Urban India'
];

const topicRules = [
  [/\b(healthcare|clinical|ehr|hie|fhir|hl7|hospital|medicine|medical|patient|patients|clinical-trial|trials|warehouse|veterans|mumps)\b/i, ['Healthcare IT', 'Healthcare Data', 'Clinical Informatics', 'Health IT Architecture', 'Medical Data Systems', 'Interoperability']],
  [/\b(ai|artificial-intelligence|artificial intelligence|agentic|agent|agents|llm|gpt|claude|model|models|vector|rag|machine-learning|deployment|automation)\b/i, ['Artificial Intelligence', 'AI Commentary', 'AI Ethics', 'AI Safety', 'Large Language Models', 'AI in India', 'Agentic AI', 'Technology Culture']],
  [/\b(calcutta|kolkata|bengali|pohela|sitala|manasa|fish|darjeeling|terrace|smog|bus)\b/i, ['Kolkata Life', 'Calcutta Bengali', 'Bengali Culture', 'West Bengal', 'Urban Kolkata']],
  [/\b(depression|mental|anxiety|bipolar|happiness|nightmare|hikikomori|shadow|loneliness)\b/i, ['Mental Health', 'Bipolar Depression', 'Anxiety', 'Depression Writing', 'Mental Health India', 'Loneliness', 'Middle Age', 'Personal Essay']],
  [/\b(india|indian|bangalore|jugaad|semiconductor|unemployment|democracy|politics|political|goons|scientific)\b/i, ['India Commentary', 'Indian Politics', 'Indian Society', 'Indian Economy', 'Public Systems']],
  [/\b(music|songs|synthetic)\b/i, ['AI Music', 'Bengali Songs', 'Synthetic Media', 'Music Commentary']],
  [/\b(math|mathematics|variance|subspaces|randomness|chaos|atoms|selection|trigonometry|statistics|statistical|modeling)\b/i, ['Mathematics', 'Statistics', 'Science Writing', 'Education', 'First Principles']],
  [/\b(war|ukraine|iran|hormuz|lpg|spillovers)\b/i, ['Geopolitics', 'Energy Security', 'War Technology', 'Global Supply Chains']]
];

function parsePost(text, file) {
  if (!text.startsWith('---\n')) throw new Error(`${file} does not start with frontmatter`);
  const end = text.indexOf('\n---', 4);
  if (end < 0) throw new Error(`${file} has no closing frontmatter`);
  return {
    fm: text.slice(4, end),
    body: text.slice(end + 4).replace(/^\r?\n/, '')
  };
}

function fieldValue(fm, field) {
  const match = fm.match(new RegExp(`^${field}\\s*:\\s*(.*)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^["']|["']$/g, '');
}

function parseTags(fm) {
  const match = fm.match(/^tags\s*:\s*\[(.*)\]\s*$/m);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function unique(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const clean = item.trim();
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

function titleFromSlug(slug) {
  return sanitizeProfanity(slug
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bIt\b/g, 'IT')
    .replace(/\bUs\b/g, 'US')
    .replace(/\bVa\b/g, 'VA')
    .replace(/\bFhir\b/g, 'FHIR')
    .replace(/\bHl7\b/g, 'HL7')
    .replace(/\bLlm\b/g, 'LLM')
    .replace(/\bDefecate\b/g, 'Defecate'));
}

function slugifyCategory(category) {
  return (category || 'uncategorized')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'uncategorized';
}

function updateTags(fm, tags) {
  const rendered = `tags: [${tags.map((tag) => `"${tag.replace(/"/g, '\\"')}"`).join(', ')}]`;
  if (/^tags\s*:/m.test(fm)) return fm.replace(/^tags\s*:.*$/m, rendered);
  const lines = fm.split(/\r?\n/);
  const idx = lines.findIndex((line) => /^published\s*:/.test(line));
  if (idx >= 0) lines.splice(idx, 0, rendered);
  else lines.push(rendered);
  return lines.join('\n');
}

function sanitizeProfanity(text) {
  return text
    .replace(/\b[Tt]he [Mm]achine [Tt]hat [Cc]annot [Tt]ake a mess\b/g, 'The Machine That Cannot Defecate')
    .replace(/\b[Tt]he [Mm]achine [Tt]hat [Cc]annot [Tt]ake [Aa] [Ss]hit\b/g, 'The Machine That Cannot Defecate')
    .replace(/\b[Tt]ake a mess\b/g, 'defecate')
    .replace(/\b[Tt]ake [Aa] [Ss]hit\b/g, 'defecate')
    .replace(/\bget their mess together\b/g, 'get their act together')
    .replace(/\bget their shit together\b/gi, 'get their act together')
    .replace(/\b[Ff]uck that\b/g, 'No, thank you to that')
    .replace(/\b[Ff]uck\b/g, 'forget')
    .replace(/\b[Ff]ucking\b/g, 'wretched')
    .replace(/\b[Bb]ullshit\b/g, 'nonsense')
    .replace(/\b[Ss]hit\b/g, 'mess')
    .replace(/\b[Ss]hitty\b/g, 'miserable')
    .replace(/\b[Pp]iss\b/g, 'urine')
    .replace(/\b[Pp]issed\b/g, 'furious')
    .replace(/\b[Aa]sshole\b/g, 'lout')
    .replace(/\b[Bb]astard\b/g, 'brute');
}

function loosenDryPhrases(text) {
  return text
    .replace(/The practical implication is plain but hard:/g, 'The practical point, stripped of lecture-hall varnish, is this:')
    .replace(/The practical implication is severe:/g, 'The practical point is severe, and not in the conference-panel way:')
    .replace(/The practical implication is/g, 'The practical point is')
    .replace(/The non-obvious architectural insight is this:/g, 'The less obvious machinery underneath is this:')
    .replace(/The non-obvious architectural insight is/g, 'The less obvious machinery underneath is')
    .replace(/A clean solution is prevented by/g, 'The neat solution runs into')
    .replace(/The clean solution is prevented by/g, 'The neat solution runs into')
    .replace(/The deeper truth is that/g, 'Under the floorboards, the truth is that')
    .replace(/The important part is not that/g, 'The important part, from my small Calcutta desk, is not that')
    .replace(/This creates the likely near-term settlement:/g, 'So the near-term settlement will probably be this:')
    .replace(/The central architectural fact is this:/g, 'The central architectural fact, after removing the marketing perfume, is this:');
}

function stripGeneratedSections(body) {
  let out = body;
  out = out.replace(/\n?Acronyms expanded in this post:\n(?:- [^\n]+\n)+\n---\n\n/g, '');
  out = out.replace(/\n?Acronyms expanded in this post: No central technical acronyms need expansion here\.\n\n---\n\n/gs, '');
  out = out.replace(/\n?Acronyms used in this post:.*?\n\n/gs, '');
  out = out.replace(/\n?## Related Posts\n[\s\S]*?$/g, '').trimEnd() + '\n';
  out = out.replace(/\n?## Related Reading\n[\s\S]*?$/g, '').trimEnd() + '\n';
  out = out.replace(/\n?---\n\n(?=<TTS \/>|<Pi )/g, '\n');
  return out;
}

function splitComponents(body) {
  const lines = body.split(/\r?\n/);
  const lead = [];
  const seenComponents = new Set();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '') {
      if (lead.length && lead[lead.length - 1] !== '') lead.push(lines[i]);
      i += 1;
      continue;
    }
    if (/^<[A-Z][A-Za-z0-9]*(\s|\/|>)/.test(line)) {
      if (!seenComponents.has(line)) {
        lead.push(lines[i]);
        seenComponents.add(line);
      }
      i += 1;
      continue;
    }
    break;
  }
  return {
    lead: lead.join('\n').trim(),
    prose: lines.slice(i).join('\n').trim().replace(/^---\n+/, '').trim()
  };
}

function acronymBlock(fullText) {
  const present = [];
  for (const [short, expanded, explanation] of acronyms) {
    const escaped = short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
    const re = new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`);
    if (re.test(fullText)) present.push(`- ${short}: ${expanded}. ${explanation}.`);
  }
  if (!present.length) return 'Acronyms expanded in this post: No central technical acronyms need expansion here.';
  return `Acronyms expanded in this post:\n${present.join('\n')}`;
}

function keywordsFor(meta, text) {
  const blob = `${meta.file} ${meta.title} ${meta.category} ${text}`.toLowerCase();
  const protectedOriginal = new Set(['video', 'audio', 'music', 'songs', 'engineering blog', 'suvroghosh']);
  const identityBlob = `${meta.file} ${meta.title} ${meta.category}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const existing = (meta.existingTags || []).filter((tag) => {
    const lower = tag.toLowerCase();
    if (protectedOriginal.has(lower)) return true;
    const words = lower.replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((word) => word.length > 1);
    return words.length > 0 && words.every((word) => identityBlob.includes(word));
  });
  const tags = [...existing, ...baseSeoTags, meta.category, titleFromSlug(meta.slug)];
  for (const [pattern, add] of topicRules) {
    if (pattern.test(blob)) tags.push(...add);
  }
  return unique(tags).slice(0, 48);
}

function tokenSet(meta, text) {
  const stop = new Set('the and for with that this from into about will would should could there their have has are was were not but you your its as by of in on to a an is it be or if at after before over under across through my me i we they he she his her our old new used using use post blog video engineering suvroghosh'.split(' '));
  return new Set(`${meta.file} ${meta.title} ${meta.category} ${text}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stop.has(word)));
}

const posts = files.map((file) => {
  const full = path.join(postsDir, file);
  const raw = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  const parsed = parsePost(raw, file);
  const slug = file.replace(/\.md$/, '');
  return {
    file,
    full,
    raw,
    ...parsed,
    slug,
    title: sanitizeProfanity(fieldValue(parsed.fm, 'title') || titleFromSlug(slug)),
    category: fieldValue(parsed.fm, 'category') || 'Uncategorized',
    existingTags: parseTags(parsed.fm)
  };
});

for (const post of posts) {
  post.tokens = tokenSet(post, post.body);
}

const crosslinks = {};
for (const post of posts) {
  const scored = posts
    .filter((other) => other.file !== post.file)
    .map((other) => {
      let score = 0;
      for (const token of post.tokens) if (other.tokens.has(token)) score += 1;
      if (slugifyCategory(other.category) === slugifyCategory(post.category)) score += 8;
      return { other, score };
    })
    .sort((a, b) => b.score - a.score || a.other.file.localeCompare(b.other.file))
    .slice(0, 4)
    .map(({ other, score }) => ({
      file: other.file,
      title: other.title,
      category: other.category,
      url: `/blog/${slugifyCategory(other.category)}/${other.slug}`,
      score
    }));
  crosslinks[post.file] = scored;
}

for (const post of posts) {
  if (process.env.P1_DEBUG) console.error(`updating ${post.file}`);
  let body = stripGeneratedSections(post.body);
  body = sanitizeProfanity(loosenDryPhrases(body));

  let fm = sanitizeProfanity(post.fm);
  fm = fm.replace(/^title\s*:.*$/m, `title: "${post.title.replace(/"/g, '\\"')}"`);
  const tags = keywordsFor(post, body);
  fm = updateTags(fm, tags);

  const { lead, prose } = splitComponents(body);
  const acronymsText = acronymBlock(`${fm}\n${prose}`);
  const related = crosslinks[post.file]
    .map((link) => `- [${link.title}](${link.url})`)
    .join('\n');
  const newBody = [
    lead,
    acronymsText,
    '---',
    prose,
    '## Related Posts',
    related
  ].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';

  fs.writeFileSync(post.full, `---\n${fm.trim()}\n---\n\n${newBody}`, 'utf8');
}

fs.writeFileSync(
  path.join(postsDir, 'post-crosslinks.json'),
  `${JSON.stringify(crosslinks, null, 2)}\n`,
  'utf8'
);

console.log(`P1 pass complete: ${posts.length} posts updated and post-crosslinks.json generated.`);
