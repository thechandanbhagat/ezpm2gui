import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderTslnDocumentation } from '../../scripts/render-tsln-documentation';

const MAX_MARKDOWN_BYTES = 64 * 1024;
const heading = '# TSLN documentation\n\n';

for (const input of [null, undefined, 0, {}]) {
  assert.throws(() => renderTslnDocumentation(input), TypeError);
}
for (const input of ['', ' \n', '---\nowner: maintainers\n---\n']) {
  assert.throws(() => renderTslnDocumentation(input), /must not be empty/);
}
assert.throws(() => renderTslnDocumentation('No title'), /must begin/);
assert.throws(() => renderTslnDocumentation('# First\n\n# Second'), /contain one/);
assert.doesNotThrow(() => renderTslnDocumentation(heading + 'a'.repeat(MAX_MARKDOWN_BYTES - Buffer.byteLength(heading))));
assert.throws(() => renderTslnDocumentation(heading + 'a'.repeat(MAX_MARKDOWN_BYTES - Buffer.byteLength(heading) + 1)), RangeError);
assert.throws(() => renderTslnDocumentation(heading + '界'.repeat(MAX_MARKDOWN_BYTES)), RangeError);

const example = renderTslnDocumentation(`---
title: Metadata title
owner: maintainers
---
# TSLN & evidence

## Rows

**Repeated** messages retain their evidence line.

\`\`\`text
# TSLN-based log profile/1
1|"stdout"|"="|"<script>"
\`\`\`

| Representation | Bytes |
| --- | ---: |
| JSON | 24,493 |

[Paper](https://doi.org/10.31224/6375)
[Encoder](../../src/server/services/LogAnalysisTsln.ts)
[Tests](../../tests/unit/log-analysis-tsln.test.ts)
[Traversal](../../src/../secrets.env)
[Script](javascript:alert%281%29)
[Data](data:text/html,alert)

<script>alert('raw HTML')</script>
<img src="https://example.com/tracker" onerror="alert(1)">
![External image](https://example.com/pixel)
`);
assert.match(example, /<title>TSLN &amp; evidence — EZ PM2 GUI<\/title>/);
assert.match(example, /<h1[^>]*>TSLN &amp; evidence<\/h1>/);
assert.match(example, /<h2[^>]*>Rows<\/h2>/);
assert.match(example, /<strong>Repeated<\/strong>/);
assert.match(example, /<pre><code[^>]*># TSLN-based log profile\/1/);
assert.ok(example.includes('1|&quot;stdout&quot;|&quot;=&quot;|&quot;&lt;script&gt;&quot;'));
assert.match(example, /<table>/);
assert.match(example, /<th[^>]*scope="col"/);
assert.match(example, /href="https:\/\/doi.org\/10.31224\/6375"/);
assert.match(example, /href="https:\/\/github.com\/thechandanbhagat\/ezpm2gui\/blob\/main\/src\/server\/services\/LogAnalysisTsln.ts"/);
assert.match(example, /href="https:\/\/github.com\/thechandanbhagat\/ezpm2gui\/blob\/main\/tests\/unit\/log-analysis-tsln.test.ts"/);
assert.ok(!example.includes('Metadata title'));
assert.ok(!example.includes('href="javascript:'));
assert.ok(!example.includes('href="data:'));
assert.ok(!example.includes('href="../../src/../'));
assert.ok(!example.includes('<script>alert'));
assert.ok(!example.includes('<img '));
assert.ok(example.includes('&lt;script&gt;'));
assert.ok(example.includes('External image'));

const paritySource = `---
owner: maintainers
---
# Line ending parity

## Evidence

\`\`\`text
1|"stdout"|"same message"
2|=|=
\`\`\`

| Representation | Bytes |
| --- | ---: |
| JSON | 24,493 |
`;
const parityExpected = renderTslnDocumentation(paritySource);
assert.equal(renderTslnDocumentation(paritySource.replace(/\n/g, '\r\n')), parityExpected);
assert.equal(renderTslnDocumentation(paritySource.replace(/\n/g, '\r')), parityExpected);

const directory = join(__dirname, '../../ezpm2gui/userguides');
const source = readFileSync(join(directory, 'tsln-log-analysis.md'), 'utf8');
const rendered = renderTslnDocumentation(source);
assert.equal(readFileSync(join(directory, 'tsln-log-analysis.html'), 'utf8').replace(/\r\n?/g, '\n'), rendered,
  'Regenerate the published HTML after changing the canonical Markdown or renderer.');
for (const title of ['Why repeated logs benefit', 'How the application uses it', 'Preserving diagnostic evidence',
  'Why this is a local TSLN profile', 'Measured savings and limits', 'References and implementation']) {
  assert.ok(rendered.includes(title));
}
assert.match(rendered, /2\|=\|=\|=\|=/);
assert.ok(rendered.includes('24,493'));
assert.ok(rendered.includes('2,955'));
assert.ok(rendered.includes('87.9%'));
assert.equal((rendered.match(/<h1(?:\s[^>]*)?>/g) || []).length, 1);

console.log('TSLN documentation tests passed');
