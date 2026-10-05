import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = path.resolve(__dirname, '../docs/stitch-screens');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const screens = [
  {
    id: 'bf9e5616083640da8e97b25517f505c8',
    slug: '01_main_perfume_display_dark',
    title: 'Scentation Kiosk - Trưng Bày Nước Hoa Chính (Black & White Minimalist)',
    imageUrl:
      'https://lh3.googleusercontent.com/aida/AEtjO1W-QFqu1L0poCww3umVUq6gJ2YIEsZd0s5aeQ8GNE0fa1qOMgDfr9JQh7o19T8wfHcIWrQtKSqmewQbUyijGUiTyOo30opPUj1pXmA0HshR1cvpkEUF2arEqGNqnX19jE2UFbeDFWuChPuwALUWe_3Fan5C0ZeLCTgHyh-3oYYDX-tbJLgjBVRqTIaZg068IqUOFJ19j_A3sY2WtXTiSen2t8yPYuykdIsW9F67j9OeGWnVGzTpFc3wbQk',
    htmlUrl:
      'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1Y2ZkYTA5OTUxZTQwMzgzOWFiNmM1MjQ3OTRlEgsSBxCv0dfSoAcYAZIBIwoKcHJvamVjdF9pZBIVQhMzMjUzNjIxNjM2NTc5NDU0MTM5&filename=&opi=89354086',
  },
  {
    id: '470c55a0a93644868cf0fcff2f4ff880',
    slug: '02_detail_and_checkout_popup',
    title: 'Scentation Kiosk - Popup Chi Tiết & Thanh Toán Ngay',
    imageUrl:
      'https://lh3.googleusercontent.com/aida/AEtjO1X3X2lIzI0wNOnbjwXl6WkGqviEXrzW2F4xUXoCjwdSzU8orzG0FyZiKIwyXsGoHIJ1pbfPL6aZzE3pc-kU7P4n4YlCxz3CapRo17LF-RzMnJj_JoHlywuJkWZtm-wjUMz1HAdMeONe80oLd7_87nrlQdZZ0HNzNx6l2qU4x7sRavdetFsCpFhhOxwvmWY-QqyuCv10nOyU0RVEjoIQ84lmNnjY2YGoSCRNKRd5cWyYV7Qcm8zRbu2FYkQ',
    htmlUrl:
      'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1Y2ZkYWNhZTFjZmMwMWE2MDNmZmMyMTdlY2Q4EgsSBxCv0dfSoAcYAZIBIwoKcHJvamVjdF9pZBIVQhMzMjUzNjIxNjM2NTc5NDU0MTM5&filename=&opi=89354086',
  },
  {
    id: 'd0597dc2d2654b868cf35d82ec21da1e',
    slug: '04_payment_method_selection_popup',
    title: 'Scentation Kiosk - Popup Chọn Phương Thức Thanh Toán',
    imageUrl:
      'https://lh3.googleusercontent.com/aida/AEtjO1XQblHX8KzwqgZPGfZ0MKGrxoCAdOYLiLLYKQZu2Jw-iW66tF7EkvTtMYYmSLEGlMgN1X42r7gsDdLc8e4M8pPUnLhDj2N4WtVOQ6IeAyTsAGKt8mgqS3h_qJXO6vZe929SqTUdOiJEOg3Bxyin29BN4frGSGmyQqcl4Z5OTmsxHfSET05w1kleuGtMwPXI-fSlG56lSMlpBhKQnrLrb60SjENCXZ_YOpm-pBNk5ZXepmmuVbHznl8Cfg',
    htmlUrl:
      'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1Y2ZkYTBjODdlYzQwMzM4NWVlYmM4MzI4YzcwEgsSBxCv0dfSoAcYAZIBIwoKcHJvamVjdF9pZBIVQhMzMjUzNjIxNjM2NTc5NDU0MTM5&filename=&opi=89354086',
  },
  {
    id: 'd854bf052cc2405997b055b3d1ebde53',
    slug: '05_vietqr_instructions_popup',
    title: 'Scentation Kiosk - Popup Hướng Dẫn Quét Mã VietQR',
    imageUrl:
      'https://lh3.googleusercontent.com/aida/AEtjO1WY3db53xV3nK-BjtRB48iJaptfWQCS7g3lmV6FVQDGQHP9IiQ0zx7Z_rR2AL-9nTA1kCyAM0O_el-z94Q8qSX8mmX8fZDbxI8UrAIJbw2nKlX1o5BkY9eZBO8YJe-L2rnpjVo1UBkRPdO6CHtWb9rjIkdsGquRw7-0tB1iphOkI7shl9WEveT6D5hqA71VvuBjJET6sGm3Ens2OQQfFGmw2n_UNUXiuh79FbrKJXKLRAsnS7UhZxE2hFY',
    htmlUrl:
      'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1Y2ZkYTBiNDk1M2YwNTc2MDE0NTc4MDMyZjFiEgsSBxCv0dfSoAcYAZIBIwoKcHJvamVjdF9pZBIVQhMzMjUzNjIxNjM2NTc5NDU0MTM5&filename=&opi=89354086',
  },
  {
    id: '59de8a51def14a86b2f32bdeeca4ebf6',
    slug: '06_pos_nfc_instructions_popup',
    title: 'Scentation Kiosk - Popup Hướng Dẫn Thanh Toán Thẻ POS/NFC',
    imageUrl:
      'https://lh3.googleusercontent.com/aida/AEtjO1UWI3Ew-CtGZhO7uuGERN2vlxmqxmNZYNaygKBDw-w0QM_Hf8Xq63B1l3n5jysCTiWy9BOZVA_Ol1nS6YYtQRiLAIpi6aRzauuh2McoSDJ1WL1Tst0VdCoV6tfoCNuPhIVow-FiFNERFwK6rL5kKM990ruJhYllhF6UqLl3t2sZu8n8ZA6zkZbzFY4VPnw_VYstpmQZt9kzG8ZnuuDadZMN4WCHEVKC5tU4SjepgSDMvho6S90Uen29dwc',
    htmlUrl:
      'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1Y2ZkYWM5YmYzZWQwNzkyZjRlMTYxMDRhMDI4EgsSBxCv0dfSoAcYAZIBIwoKcHJvamVjdF9pZBIVQhMzMjUzNjIxNjM2NTc5NDU0MTM5&filename=&opi=89354086',
  },
];

async function downloadFile(url, destPath) {
  console.log(`Downloading: ${url} -> ${destPath}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  console.log(`Saved: ${destPath} (${buffer.length} bytes)`);
}

async function main() {
  console.log(`Target directory: ${targetDir}`);
  for (const screen of screens) {
    console.log(`\n=== Processing screen: [${screen.id}] ${screen.title} ===`);
    const imagePath = path.join(targetDir, `${screen.slug}.png`);
    const htmlPath = path.join(targetDir, `${screen.slug}.html`);

    await downloadFile(screen.imageUrl, imagePath);
    await downloadFile(screen.htmlUrl, htmlPath);
  }
  console.log('\nAll screens downloaded successfully!');
}

main().catch((err) => {
  console.error('Error downloading screens:', err);
  process.exit(1);
});
