"""
AI-powered .po file translator for Horilla HRM
Uses Gemini 2.5 Flash with HRM business context
Run: python tools/ai_translate_hrm.py [--dry-run]
"""
import os
import re
import sys
import time
import json
import argparse

sys.stdout.reconfigure(encoding='utf-8')

from google import genai
from google.genai import types

GEMINI_API_KEY = "AIzaSyDr8fBlhUiBZjnEx-d2MTgkpugyDCjxDIw"
BATCH_SIZE = 25
BASE_DIR = r"C:\Users\NAQuan\source\repos\anhquankcn\horilla"

SYSTEM_PROMPT = """Ban la chuyen gia dich thuat phan mem HRM (Human Resource Management) tieng Viet.
Dich cac chuoi giao dien sau sang tieng Viet chuan, sat nghia nguoi dung cuoi:

THUAT NGU HRM CHUAN:
- Employee -> Nhan vien
- Department -> Phong ban
- Designation -> Chuc danh
- Job Position -> Vi tri cong viec
- Job Type -> Loai hinh cong viec
- Attendance -> Cham cong
- Leave -> Nghi phep
- Leave Type -> Loai phep
- Leave Request -> Don xin nghi
- Payroll -> Bang luong
- Salary -> Luong
- Allowance -> Phu cap
- Deduction -> Khau tru
- Contract -> Hop dong lao dong
- Appraisal -> Danh gia nhan vien
- Recruitment -> Tuyen dung
- Candidate -> Ung vien
- Onboarding -> Thu tuc vao lam
- Offboarding -> Thu tuc nghi viec
- Shift -> Ca lam viec
- Work Type -> Hinh thuc lam viec
- Overtime -> Tang ca
- Holiday -> Ngay le
- Asset -> Tai san
- Document -> Tai lieu
- Helpdesk -> Ho tro noi bo
- Announcement -> Thong bao
- Notice Period -> Thoi gian bao truoc khi nghi
- Probation -> Thu viec
- Resign -> Nghi viec
- Terminate -> Cho thoi viec
- Reporting Manager -> Quan ly truc tiep
- Work Experience -> Kinh nghiem lam viec
- Emergency Contact -> Lien he khan cap
- Bank Account -> Tai khoan ngan hang
- Tax -> Thue
- Insurance -> Bao hiem
- Performance -> Hieu suat
- KPI -> Chi so KPI
- Training -> Dao tao
- Skill -> Ky nang
- Certification -> Chung chi
- Badge -> Huy hieu
- Penalty -> Phat
- Warning -> Canh cao
- Archive -> Luu tru
- Active -> Dang hoat dong
- Inactive -> Khong hoat dong
- Approve -> Phe duyet
- Reject -> Tu choi
- Pending -> Cho duyet
- Dashboard -> Trang tong quan
- Report -> Bao cao
- Filter -> Bo loc
- Export -> Xuat du lieu
- Import -> Nhap du lieu
- Bulk -> Hang loat
- Permission -> Quyen han
- Role -> Vai tro

QUY TAC:
- Giu nguyen %(var)s, {var}, %s, %d, %%
- Giu nguyen HTML tags <b>, <br>, <span>...
- Khong dich: Horilla, HRMS, HR, ID, URL
- Ngan gon, phu hop nhan giao dien
- "bạn" cho giao dien noi bo

TRA LOI: Chi JSON array theo dung thu tu:
["ban dich 1", "ban dich 2", ...]
Khong markdown, khong giai thich.
"""


def translate_batch(client, texts):
    if not texts:
        return []
    
    input_json = json.dumps(texts, ensure_ascii=False)
    prompt = f"{SYSTEM_PROMPT}\n\nDich:\n{input_json}"
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=8192,
            )
        )
        text = response.text.strip()
        
        if text.startswith('```'):
            text = re.sub(r'^```[a-z]*\n?', '', text)
            text = re.sub(r'\n?```$', '', text)
        
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            result = json.loads(match.group())
            if isinstance(result, list) and len(result) == len(texts):
                return result
        print(f"  [WARN] Response mismatch, got {len(result) if 'result' in dir() else 0} expected {len(texts)}")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    return texts


def translate_po_file(client, filepath, dry_run=False):
    rel = filepath.replace(BASE_DIR, '').lstrip('\\/') 
    print(f"\n[FILE] {rel}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all msgid/msgstr pairs where msgstr is empty
    pattern = re.compile(
        r'(msgid ")((?:[^"\\]|\\.)*)("\n)(msgstr "")(\n)',
        re.MULTILINE
    )
    
    matches = list(pattern.finditer(content))
    
    # Filter out header (empty msgid) and non-empty msgid
    to_translate = []
    for m in matches:
        msgid = m.group(2)
        if msgid and msgid.strip():
            to_translate.append(m)
    
    if not to_translate:
        print(f"  -> All {len(matches)} entries already translated, skipping.")
        return False
    
    print(f"  -> {len(to_translate)} empty entries to translate...")
    
    if dry_run:
        for m in to_translate[:5]:
            print(f"     sample: \"{m.group(2)[:60]}\"")
        return False
    
    # Translate in batches
    all_translations = {}
    
    for i in range(0, len(to_translate), BATCH_SIZE):
        batch = to_translate[i:i+BATCH_SIZE]
        texts = [m.group(2) for m in batch]
        
        bn = i // BATCH_SIZE + 1
        bt = (len(to_translate) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  -> Batch {bn}/{bt} ({len(texts)} items)...", end='', flush=True)
        
        translations = translate_batch(client, texts)
        
        count = 0
        for j, m in enumerate(batch):
            if j < len(translations) and translations[j] != texts[j]:
                all_translations[m.group(2)] = translations[j]
                count += 1
        
        print(f" {count} translated")
        time.sleep(0.3)
    
    # Apply translations using regex replace
    def replacer(m):
        msgid = m.group(2)
        if msgid in all_translations:
            trans = all_translations[msgid]
            # Escape quotes in translation
            trans = trans.replace('\\', '\\\\').replace('"', '\\"')
            return f'{m.group(1)}{m.group(2)}{m.group(3)}msgstr "{trans}"{m.group(5)}'
        return m.group(0)
    
    new_content = pattern.sub(replacer, content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"  -> Saved! ({len(all_translations)} translations applied)")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    print("=== Horilla HRM Vietnamese Translator (Gemini 2.5 Flash) ===")
    
    # Only translate the main HRM locale file
    po_files = []
    for root, dirs, files in os.walk(BASE_DIR):
        dirs[:] = [d for d in dirs if d not in ('horillavenv', '__pycache__', '.git', 'node_modules')]
        for f in files:
            if f == 'django.po' and os.sep + 'vi' + os.sep in root:
                po_files.append(os.path.join(root, f))
    
    print(f"Found {len(po_files)} Vietnamese .po files\n")
    
    updated = 0
    for fp in po_files:
        if translate_po_file(client, fp, args.dry_run):
            updated += 1
    
    print(f"\n=== Done! Updated {updated} files ===")
    if updated > 0 and not args.dry_run:
        print("Run next: python manage.py compilemessages")


if __name__ == '__main__':
    main()
