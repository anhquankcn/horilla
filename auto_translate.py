import polib
from deep_translator import GoogleTranslator
import time
import re

def translate_po_file(file_path):
    try:
        # Đọc file với encoding utf-8 để tránh lỗi ký tự
        po = polib.pofile(file_path, encoding='utf-8')
        translator = GoogleTranslator(source='en', target='vi')
        
        print(f"--- Đang xử lý: {file_path} ---")
        
        count = 0
        for entry in po:
            # Không dịch các chuỗi đã có nội dung hoặc chuỗi header (msgid rỗng)
            if not entry.msgstr and entry.msgid.strip():
                # Bỏ qua nếu không có chữ cái (chỉ có số/ký hiệu)
                if not re.search('[a-zA-Z]', entry.msgid):
                    continue
                
                try:
                    translated = translator.translate(entry.msgid)
                    entry.msgstr = translated
                    count += 1
                    print(f"[{count}] {entry.msgid} -> {entry.msgstr}")
                    time.sleep(0.3)
                except Exception as e:
                    print(f"Lỗi dòng '{entry.msgid}': {e}")
                    continue

        po.save()
        print(f"\nThành công! Đã dịch {count} nội dung mới.")
        
    except Exception as e:
        print(f"Lỗi không thể đọc file .po: {e}")
        print("Mẹo: Hãy thử xóa file .po và chạy lệnh 'makemessages' lại.")

if __name__ == "__main__":
    path = 'horilla/locale/vi/LC_MESSAGES/django.po'
    translate_po_file(path)