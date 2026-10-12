RƎ:ALYZE V14 — Thư viện nhạc chung cho Host

1. Sao lưu database trước khi nâng cấp.
2. Chạy supabase/UPGRADE_V14_SHARED_LIBRARY.sql trong SQL Editor.
3. Đăng lại index.html, app.js, style.css và config.js lên GitHub Pages. Giữ nguyên URL và publishable key cũ.
4. Host tải nhạc vào thư viện chung; khi đề cử, web tạo bản ghi cho phòng hiện tại mà không upload lại file.
5. Dữ liệu đã tải ở các phòng trước được đưa vào thư viện Host theo owner_id.
6. File Storage chưa được tự xóa khi xóa mục khỏi thư viện để tránh làm hỏng bài đang dùng ở phòng khác.

Chưa kiểm thử kết nối với dự án Supabase thực tế.
