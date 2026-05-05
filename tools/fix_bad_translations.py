"""
Fix bad HRM translations + AI re-translate using context-aware prompts
"""
import re, sys, json, time
sys.stdout.reconfigure(encoding='utf-8')
from google import genai
from google.genai import types

GEMINI_API_KEY = "AIzaSyDr8fBlhUiBZjnEx-d2MTgkpugyDCjxDIw"
PO_FILE = r"C:\Users\NAQuan\source\repos\anhquankcn\horilla\horilla\locale\vi\LC_MESSAGES\django.po"

# Sửa thủ công những từ sai nghĩa rõ ràng
MANUAL_FIXES = {
    # msgstr (tiếng Việt sai) -> msgstr đúng
    'msgstr "Cánh đồng"': 'msgstr "Trường dữ liệu"',
    'msgstr "Lĩnh vực"': 'msgstr "Trường dữ liệu"',       # Field khi là form field
    'msgstr "Xuất khẩu"': 'msgstr "Xuất dữ liệu"',
    'msgstr "Nhập khẩu"': 'msgstr "Nhập dữ liệu"',
    'msgstr "Chỉ huy"': 'msgstr "Trưởng nhóm"',
    'msgstr "Sự miêu tả"': 'msgstr "Mô tả"',
    'msgstr "Sinh ra"': 'msgstr "Tạo mới"',
    'msgstr "Cộng sự"': 'msgstr "Đối tác"',
    'msgstr "Lôi kéo"': 'msgstr "Kéo thả"',
    'msgstr "Đặt hàng"': 'msgstr "Thứ tự"',
    'msgstr "Biên tập"': 'msgstr "Chỉnh sửa"',
    'msgstr "Đi vào"': 'msgstr "Nhập"',
    'msgstr "Thao tác"': 'msgstr "Hành động"',
    'msgstr "Đồng ruộng"': 'msgstr "Trường dữ liệu"',
    'msgstr "Vương miện"': 'msgstr "Huy hiệu"',
    'msgstr "Tắt tính năng"': 'msgstr "Vô hiệu hóa"',
    'msgstr "Bật tính năng"': 'msgstr "Kích hoạt"',
    'msgstr "Tái sinh"': 'msgstr "Đặt lại"',
    'msgstr "Chuyên biệt"': 'msgstr "Chuyên môn"',
    'msgstr "Lịch trình"': 'msgstr "Lịch làm việc"',
    'msgstr "Dây chuyền"': 'msgstr "Quy trình"',
    'msgstr "Khách hàng"': 'msgstr "Ứng viên"',           # trong context tuyển dụng
}

# Pattern sửa trong chuỗi phức tạp (substring)
SUBSTRING_FIXES = [
    ("xuất khẩu", "xuất dữ liệu"),
    ("nhập khẩu", "nhập dữ liệu"),
    ("Xuất khẩu", "Xuất dữ liệu"),
    ("Nhập khẩu", "Nhập dữ liệu"),
    ("cánh đồng", "trường dữ liệu"),
    ("Cánh đồng", "Trường dữ liệu"),
]

# msgid nào cần AI dịch lại (dịch sai hoặc chưa đúng ngữ cảnh HRM)
RETRANSLATE_MSGIDS = [
    "Field",
    "Fields", 
    "Export",
    "Import",
    "Generate",
    "No assets to export.",
    "Export Holiday",
    "Export Employees",
    "Export Request",
    "Export Candidates",
    "Export Contract",
]

HRM_CONTEXT = """Dich sang tieng Viet trong phan mem quan ly nhan su (HRM):
- Field -> Truong du lieu (khong phai canh dong)
- Fields -> Cac truong du lieu
- Export -> Xuat du lieu (khong phai xuat khau)
- Import -> Nhap du lieu (khong phai nhap khau)
- Generate -> Tao / Tao moi
- No assets to export. -> Khong co tai san de xuat.
- Export Holiday -> Xuat du lieu ngay le
- Export Employees -> Xuat du lieu nhan vien
- Export Request -> Xuat du lieu yeu cau
- Export Candidates -> Xuat du lieu ung vien
- Export Contract -> Xuat du lieu hop dong

TRA LOI: JSON array ["ban dich 1", ...]"""

def fix_file():
    with open(PO_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    fix_count = 0
    
    # 1. Manual exact fixes
    for bad, good in MANUAL_FIXES.items():
        if bad in content:
            content = content.replace(bad, good)
            fix_count += 1
            print(f"  Fixed: {bad} -> {good}")
    
    # 2. Substring fixes (for compound strings)
    for bad, good in SUBSTRING_FIXES:
        # Only replace inside msgstr lines
        lines = content.split('\n')
        new_lines = []
        for line in lines:
            if line.startswith('msgstr "') and bad in line:
                new_line = line.replace(bad, good)
                if new_line != line:
                    print(f"  Fixed substring: ...{bad}... in: {line[:60]}")
                    fix_count += 1
                    line = new_line
            new_lines.append(line)
        content = '\n'.join(new_lines)
    
    # 3. AI re-translate specific msgids
    print(f"\n  Re-translating {len(RETRANSLATE_MSGIDS)} specific msgids via AI...")
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    prompt = f"{HRM_CONTEXT}\n\nDich:\n{json.dumps(RETRANSLATE_MSGIDS, ensure_ascii=False)}"
    try:
        resp = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=2048)
        )
        text = resp.text.strip()
        if text.startswith('```'):
            text = re.sub(r'^```[a-z]*\n?', '', text)
            text = re.sub(r'\n?```$', '', text)
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            translations = json.loads(match.group())
            for msgid, trans in zip(RETRANSLATE_MSGIDS, translations):
                # Replace empty or wrong msgstr for this msgid
                escaped_msgid = re.escape(msgid)
                pattern = rf'(msgid "{escaped_msgid}"\nmsgstr )"[^"]*"'
                replacement = rf'\1"{trans}"'
                new_content = re.sub(pattern, replacement, content)
                if new_content != content:
                    print(f"  AI fixed: \"{msgid}\" -> \"{trans}\"")
                    content = new_content
                    fix_count += 1
    except Exception as e:
        print(f"  [AI ERROR] {e}")
    
    if content != original:
        with open(PO_FILE, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"\n  Saved! Total {fix_count} fixes applied.")
    else:
        print("\n  No changes needed.")

if __name__ == '__main__':
    print("=== HRM Translation Fixer ===")
    fix_file()
    print("\nDone! Run: python manage.py compilemessages")
