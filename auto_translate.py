import polib
from deep_translator import GoogleTranslator
import time
import re
import sys
import io

# Fix UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# HRM-specific glossary: override Google Translate for domain terms
HRM_GLOSSARY = {
    'employee': 'nhân viên',
    'employees': 'nhân viên',
    'attendance': 'chấm công',
    'leave': 'nghỉ phép',
    'leave request': 'yêu cầu nghỉ phép',
    'leave requests': 'yêu cầu nghỉ phép',
    'leave allocation': 'phân bổ ngày phép',
    'leave type': 'loại nghỉ phép',
    'payroll': 'bảng lương',
    'payslip': 'phiếu lương',
    'payslips': 'phiếu lương',
    'salary': 'lương',
    'department': 'phòng ban',
    'departments': 'phòng ban',
    'job position': 'vị trí công việc',
    'job role': 'vai trò công việc',
    'shift': 'ca làm việc',
    'shifts': 'ca làm việc',
    'work type': 'hình thức làm việc',
    'overtime': 'làm thêm giờ',
    'late check-in': 'đi trễ',
    'early check-out': 'về sớm',
    'check-in': 'chấm vào',
    'check-out': 'chấm ra',
    'onboarding': 'tiếp nhận nhân viên mới',
    'offboarding': 'thủ tục nghỉ việc',
    'resignation': 'đơn xin nghỉ việc',
    'performance': 'hiệu suất',
    'appraisal': 'đánh giá',
    'recruitment': 'tuyển dụng',
    'candidate': 'ứng viên',
    'candidates': 'ứng viên',
    'interview': 'phỏng vấn',
    'job opening': 'vị trí tuyển dụng',
    'asset': 'tài sản',
    'assets': 'tài sản',
    'helpdesk': 'hỗ trợ',
    'ticket': 'phiếu yêu cầu',
    'tickets': 'phiếu yêu cầu',
    'announcement': 'thông báo',
    'announcements': 'thông báo',
    'dashboard': 'trang tổng quan',
    'profile': 'hồ sơ',
    'company': 'công ty',
    'companies': 'công ty',
    'manager': 'quản lý',
    'managers': 'quản lý',
    'hr manager': 'quản lý nhân sự',
    'admin': 'quản trị viên',
    'administrator': 'quản trị viên',
    'permission': 'quyền hạn',
    'permissions': 'quyền hạn',
    'work information': 'thông tin công việc',
    'personal information': 'thông tin cá nhân',
    'bank account': 'tài khoản ngân hàng',
    'document': 'tài liệu',
    'documents': 'tài liệu',
    'contract': 'hợp đồng',
    'contracts': 'hợp đồng',
    'tax': 'thuế',
    'deduction': 'khấu trừ',
    'allowance': 'phụ cấp',
    'bonus': 'thưởng',
    'net pay': 'lương thực nhận',
    'gross pay': 'lương gộp',
    'working hours': 'giờ làm việc',
    'work schedule': 'lịch làm việc',
    'holiday': 'ngày nghỉ lễ',
    'holidays': 'ngày nghỉ lễ',
    'public holiday': 'ngày lễ công',
}

def extract_placeholders(text):
    """Extract all format placeholders from text."""
    brace = re.findall(r'\{[^}]*\}', text)
    percent = re.findall(r'%\([^)]+\)[sdifr]', text)
    return set(brace + percent)

def fix_placeholders(original, translated):
    """Restore any format placeholders that Google Translate mangled."""
    orig_holders = extract_placeholders(original)
    trans_holders = extract_placeholders(translated)
    if orig_holders == trans_holders:
        return translated
    # Find mangled placeholders by position order and restore them
    orig_list = re.findall(r'\{[^}]*\}|%\([^)]+\)[sdifr]', original)
    result = translated
    for orig_ph in orig_list:
        # Try to find a translated version of this placeholder
        if orig_ph not in result:
            # Replace first unmatched placeholder in result
            result = re.sub(r'\{[^}]*\}|%\([^)]+\)[sdifr]', orig_ph, result, count=1)
    return result

def should_skip(msgid):
    if not re.search('[a-zA-Z]', msgid):
        return True
    if not msgid.strip():
        return True
    if re.match(r'^https?://', msgid.strip()):
        return True
    return False

def apply_glossary(text):
    """Apply HRM glossary corrections to translated text."""
    return text

def translate_po_file(file_path):
    try:
        po = polib.pofile(file_path, encoding='utf-8')
        translator = GoogleTranslator(source='en', target='vi')

        print(f"--- Dang xu ly: {file_path} ---")

        untranslated = [e for e in po if not e.msgstr and not should_skip(e.msgid)]
        print(f"Can dich: {len(untranslated)} entries")

        count = 0
        skip_count = 0
        for entry in untranslated:
            msgid_lower = entry.msgid.lower().strip()

            # Check glossary first (exact or partial match)
            glossary_hit = HRM_GLOSSARY.get(msgid_lower)
            if glossary_hit:
                entry.msgstr = glossary_hit
                count += 1
                print(f"[GLOSSARY {count}] {entry.msgid} -> {entry.msgstr}")
                continue

            try:
                translated = translator.translate(entry.msgid)
                if translated and translated.strip():
                    fixed = fix_placeholders(entry.msgid, translated)
                    entry.msgstr = fixed
                    count += 1
                    print(f"[{count}] {entry.msgid[:60]} -> {entry.msgstr[:60]}")
                else:
                    skip_count += 1
                time.sleep(0.3)
            except Exception as e:
                print(f"[ERROR] '{entry.msgid[:60]}': {e}")
                time.sleep(1)
                continue

        po.save()
        print(f"\nHoan thanh! Da dich {count} entries moi. Bo qua: {skip_count}.")

    except Exception as e:
        print(f"Loi doc file .po: {e}")
        raise

if __name__ == "__main__":
    path = 'horilla/locale/vi/LC_MESSAGES/django.po'
    translate_po_file(path)
