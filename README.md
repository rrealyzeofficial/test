RƎ:ALYZE V13 — sửa vai trò và đồng bộ phòng

1. Dùng lại config.js của website đang hoạt động, chỉ điền Supabase URL và publishable/anon key.
2. Chạy supabase/UPGRADE_V13.sql trong Supabase SQL Editor một lần sau khi đã chạy schema và nâng cấp V11.
3. Đăng toàn bộ file lên hosting và tải lại trang bằng Ctrl+F5.
4. Kiểm tra với 3 trình duyệt độc lập (hoặc 3 thiết bị): Host, BGK, Thí sinh. Không dùng cùng một phiên đăng nhập Supabase để giả lập 3 vai trò.

Vai trò được kiểm tra từ ra_members trên database, không được suy ra từ URL. Link/mã mời không cấp quyền Host.
Realtime đăng ký thay đổi phòng và thành viên; website còn có đồng bộ dự phòng 3 giây khi tab đang hiển thị.
V13 chưa phải bản đã kiểm thử end-to-end trên Supabase thực tế của bạn.
