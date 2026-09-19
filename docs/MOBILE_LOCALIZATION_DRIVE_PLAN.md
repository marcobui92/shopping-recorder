# Kế hoạch trải nghiệm điện thoại, tiếng Việt và Google Drive

Ngày chốt tài liệu: 2026-09-15. Feature lập kế hoạch: `feat-026`.

## Trạng thái và phạm vi

Người dùng chủ yếu sử dụng điện thoại. Các hướng dưới đây đã được ghi nhận qua thảo luận; phiên này chỉ viết tài liệu và chia feature, chưa triển khai giao diện, API, migration hoặc tích hợp Google.

Hiện ứng dụng đã có tài khoản, tạo bản ghi đóng/mở gói, tải ảnh/video lên Backblaze B2, xem lịch sử, sửa metadata có nhật ký, hủy và xóa theo chính sách hiện hành. Giao diện hiện chủ yếu tiếng Anh. Google Drive chưa được triển khai. Retry trong trang đang mở không đồng nghĩa với khôi phục sau reload.

## Hướng sản phẩm đã thống nhất

- Điện thoại là giao diện chính; tablet và desktop có bố cục thích ứng.
- Tiếng Việt là mặc định, tiếng Anh là lựa chọn bổ sung; ghi nhớ ngôn ngữ đã chọn.
- Sau đăng nhập ưu tiên thao tác tạo bản ghi và tra cứu, thu gọn phần giới thiệu và trạng thái kỹ thuật.
- Có lối vào rõ ràng cho chụp ảnh, quay video và chọn file; chọn thêm không làm mất file trước.
- Xem trọn ảnh, mở lớn/phóng to, chuyển ảnh và tải bản gốc.
- Google chỉ dùng để kết nối Drive sau khi đăng nhập tài khoản ứng dụng. Khi kết nối hợp lệ, ưu tiên Drive cho bản ghi mới; vẫn cho chọn bộ nhớ ứng dụng.
- Mỗi bản ghi giữ một nơi lưu. Không tự chuyển provider giữa chừng, không tự di chuyển bản ghi cũ. Ngắt kết nối không xóa file Drive.
- Tìm mã đơn, đối chiếu đóng/mở gói và tiếp tục bản ghi dở nằm trong backlog bổ sung.

## Thứ tự và phụ thuộc

Thứ tự nhóm đã thống nhất: trải nghiệm điện thoại trước, Google Drive tiếp theo. Thứ tự chi tiết dưới đây là đề xuất lập kế hoạch; có thể đổi khi bắt đầu triển khai. Mỗi thời điểm chỉ một feature `in-progress`.

| Thứ tự đề xuất | Feature | Kết quả | Phụ thuộc |
| --- | --- | --- | --- |
| 1 | feat-027 | Tiếng Việt mặc định và chuyển ngôn ngữ | feat-026 |
| 2 | feat-028 | Workspace ưu tiên điện thoại | feat-027 |
| 3 | feat-029 | Chụp/chọn thêm bằng chứng trên điện thoại | feat-028 |
| 4 | feat-030 | Xem ảnh lớn và tải bản gốc | feat-029 |
| 5 | feat-013 | Kết nối Google và lưu trữ Drive | feat-010, feat-011, feat-030 |
| 6 | feat-031 | Chọn nơi lưu, mặc định ưu tiên Drive | feat-013 |
| Sau nhóm trên | feat-032 | Tìm bản ghi theo mã đơn/vận đơn | feat-028 |
| Sau tìm kiếm | feat-033 | Đối chiếu đóng gói và mở gói cùng mã | feat-032, feat-030 |
| Backlog, chưa chốt thứ tự | feat-034 | Khôi phục bản ghi đang dở sau reload | feat-029, feat-031 |

Giữ `feat-013` hiện có để tránh hai feature cùng sở hữu tích hợp Drive. `feat-031` chỉ sở hữu lựa chọn/mặc định nơi lưu và các trạng thái UX liên quan. `feat-018` vẫn bị hoãn theo quyết định trước; kế hoạch này không mở lại triển khai production.

## feat-027 — Tiếng Việt mặc định

Phạm vi: toàn bộ nội dung do ứng dụng hiển thị trong đăng nhập/đăng ký, điều hướng, tạo bản ghi, lịch sử, chi tiết, sửa/hủy/xóa, tiến trình, lỗi, trạng thái rỗng và trang không tìm thấy.

Tiêu chí nghiệm thu:

- Lần mở đầu dùng tiếng Việt dù trình duyệt đang dùng tiếng Anh. Có lựa chọn “Tiếng Việt / English” dễ tìm ở cả trạng thái đăng nhập và chưa đăng nhập.
- Ghi nhớ lựa chọn trên cùng trình duyệt sau reload/mở lại; nếu không đọc/lưu được tùy chọn vẫn dùng ứng dụng bình thường và mặc định tiếng Việt. Đồng bộ ngôn ngữ giữa thiết bị chưa thuộc phạm vi.
- Đổi ngôn ngữ không xóa nội dung form, file đã chọn hoặc làm gián đoạn upload.
- Dùng danh mục bản dịch có khóa ổn định; cập nhật ngôn ngữ tài liệu HTML và nhãn trợ năng. Không hiển thị khóa bản dịch thô khi thiếu bản dịch.
- Ngày giờ, số lượng, phần trăm và dung lượng theo locale đã chọn. Đổi ngôn ngữ không đổi thời điểm lưu hoặc múi giờ; tiếp tục dùng múi giờ thiết bị và payload thời gian hiện hành.
- Nội dung người dùng, mã đơn, tên file, tên thương hiệu, ID và giá trị enum API giữ nguyên. Chỉ dịch nhãn trình bày.
- Ánh xạ mã lỗi API ổn định thành thông báo bản địa hóa; lỗi chưa biết có thông báo chung bằng ngôn ngữ hiện tại. Không phụ thuộc chuỗi thông báo tiếng Anh để quyết định hành vi.
- Giao diện hệ điều hành, bộ chọn file và trang chấp thuận Google do bên ngoài điều khiển không nằm trong cam kết dịch của ứng dụng.

Kiểm chứng: test ngôn ngữ mặc định, chuyển/khôi phục lựa chọn, lỗi dự phòng, giữ form/upload và định dạng; typecheck/build web; kiểm tra luồng chính ở cả hai ngôn ngữ. Chọn cách tổ chức bản dịch khi triển khai, chưa thêm thư viện trong phiên lập kế hoạch.

## feat-028 — Workspace ưu tiên điện thoại

Tiêu chí nghiệm thu:

- Sau đăng nhập, thao tác tạo mới xuất hiện sớm; “Tạo mới” và “Lịch sử” chuyển qua lại rõ ràng. Thu gọn phần giới thiệu và trạng thái kết nối.
- Form một cột trên điện thoại; tablet/desktop tận dụng chiều rộng mà không tạo luồng nghiệp vụ khác.
- Không cuộn ngang ngoài ý muốn ở chiều rộng 320, 360, 390, 430, 768 và 1280 CSS px; tên file/mã đơn dài và cả hai ngôn ngữ không làm vỡ bố cục.
- Đặt mục tiêu vùng bấm tối thiểu 44 × 44 CSS px cho các thao tác chính và nút biểu tượng do ứng dụng tạo.
- Nút chính dễ tiếp cận, không che nội dung, vùng an toàn màn hình hoặc trường đang nhập khi bàn phím mở. Xoay màn hình, phóng to chữ và đổi mục không làm mất bản ghi đang nhập.
- Có trạng thái tải, lỗi, rỗng, đang tải file và thử lại rõ ràng; không chỉ dùng màu để phân biệt.

Kiểm chứng: test tương tác/giữ trạng thái, typecheck/build; ghi kết quả Safari iPhone và Chrome Android với bàn phím, dọc/ngang, hai ngôn ngữ, cùng kiểm tra tablet/desktop. Giả lập viewport không thay thế bằng chứng thao tác camera/bàn phím trên thiết bị; nếu thiếu thiết bị, ghi rõ phần chưa kiểm chứng.

## feat-029 — Chụp và chọn thêm bằng chứng

Tiêu chí nghiệm thu:

- Có “Chụp ảnh”, “Quay video”, “Chọn từ máy”; dùng khả năng phù hợp của trình duyệt/thiết bị, có đường chọn file thay thế khi không thể mở camera theo yêu cầu.
- Mỗi lần chọn/chụp thêm nối vào danh sách hiện tại trước khi upload; hủy bộ chọn không làm mất dữ liệu. “Thay toàn bộ”, xóa từng file và xóa tất cả là hành động rõ ràng riêng biệt.
- Cảnh báo file có khả năng trùng trong danh sách, không âm thầm xóa bằng chứng chỉ vì trùng tên.
- Báo sớm định dạng và dung lượng không hợp lệ, giữ các file hợp lệ đã chọn. Giới hạn giao diện phải nhất quán với backend; backend vẫn kiểm tra lại.
- Giữ preview ổn định dưới StrictMode, thu hồi URL đúng vòng đời; phân biệt không xem trước được với file bị từ chối tải lên.
- File đã đăng ký vào bản ghi tiếp tục tuân thủ vòng đời upload hiện hành; feature này không mở quyền thay bằng chứng đã xác minh.

Kiểm chứng: chọn nhiều lượt, hủy bộ chọn, trùng tên, file sai loại/quá lớn, xóa/thay danh sách và retry; chụp/chọn ảnh, video thực tế trên hai trình duyệt điện thoại. Không tự hứa định dạng hoặc codec mới; ghi lại khả năng thực tế khi triển khai.

## feat-030 — Xem bằng chứng và tải bản gốc

Tiêu chí nghiệm thu:

- Preview ưu tiên hiển thị toàn ảnh, không cắt mép nhãn hoặc kiện hàng. Có trình xem lớn trong trang, phóng to và chuyển trước/sau, kèm tên và vị trí ảnh trong danh sách.
- Điều khiển đóng, quay lại, focus và thao tác chạm rõ ràng; video giữ nút phát và trạng thái lỗi dễ hiểu.
- Tải file gốc đã xác minh qua quyền truy cập chủ sở hữu hiện hành; tên file được xử lý an toàn. Hỗ trợ cách lưu/mở phù hợp trên điện thoại và mô tả đúng hành vi trình duyệt.
- Không biến link lưu trữ thành link công khai lâu dài. Lỗi phiên đăng nhập hoặc provider có thông báo và đường thử lại phù hợp.

Kiểm chứng: ảnh dọc/ngang, nhãn sát mép, nhiều ảnh, video, tải file đúng nội dung và quyền truy cập, hành vi quay lại trên điện thoại. Nếu cần bổ sung contract tải xuống, cập nhật API/client/test cùng feature. Khi Drive được thêm, `feat-013` phải kiểm tra lại trình xem/tải này với Drive.

## feat-013 — Kết nối Google và lưu trữ Drive

Giữ các quyết định đã được chấp nhận trong `ARCHITECTURE.md`: đăng nhập ứng dụng trước, một tài khoản Google, scope `drive.file`, luồng OAuth server, token được bảo vệ phía server, một thư mục `Shopping Recorder` và thư mục con cho mỗi activity.

Tiêu chí nghiệm thu:

- Trong tài khoản có kết nối, trạng thái, kết nối lại/thay thế và ngắt kết nối. Hủy hoặc lỗi OAuth đưa người dùng về ứng dụng với thông báo phù hợp, không ảnh hưởng đăng nhập ứng dụng.
- Cấu hình thiếu được báo là chưa khả dụng; callback chỉ liên kết đúng người dùng và giao dịch OAuth hợp lệ. Không lộ credential qua API, log hoặc bộ nhớ lưu trữ trình duyệt.
- Adapter Drive hỗ trợ tải, xác minh, xem/tải bản gốc và hành vi hủy/xóa/cleanup đã được phê duyệt; không đánh dấu sẵn sàng trước khi kiểm chứng nội dung.
- Giữ tính toàn vẹn bằng chứng tương đương yêu cầu sản phẩm hiện tại; xác định cách phát hiện/xử lý file Drive bị thay đổi hoặc mất quyền trước khi đóng feature. Không giả định Drive có cơ chế phiên bản giống B2.
- Hết dung lượng, mất quyền, token không hợp lệ, mất file và lỗi provider có trạng thái phục hồi rõ ràng; các thao tác vẫn kiểm tra chủ sở hữu ứng dụng.
- Ngắt kết nối không xóa file Drive. Bản ghi cũ giữ provider và nguồn gốc; ứng dụng giải thích khi không thể truy cập cho tới khi khôi phục đúng quyền. Thay tài khoản không tự chuyển quyền sở hữu hoặc di chuyển file cũ.

Kiểm chứng: unit/API/integration cho OAuth, token, ownership, upload/finalize/retrieval/lifecycle và lỗi provider; smoke với tài khoản Google thử nghiệm được phép, ghi rõ phần cần cấu hình bên ngoài. Tên endpoint, migration và biến môi trường cụ thể được chốt trong feature khi triển khai; không sửa migration đã áp dụng.

## feat-031 — Ưu tiên Drive khi chọn nơi lưu

| Trạng thái lúc tạo mới | Hành vi dự kiến |
| --- | --- |
| Drive kết nối hợp lệ và tích hợp khả dụng | Chọn Drive mặc định, vẫn cho chọn bộ nhớ ứng dụng nếu khả dụng |
| Chưa kết nối Drive, B2 khả dụng | Chọn bộ nhớ ứng dụng, có lối kết nối Google |
| Drive cần kết nối lại hoặc không khả dụng trước khi tạo | Nêu rõ lý do; cho chọn B2 nếu khả dụng hoặc kết nối lại |
| Không có provider khả dụng | Giữ dữ liệu đã nhập, giải thích và chưa cho bắt đầu upload |
| Provider lỗi sau khi bản ghi đã tạo | Giữ nguyên provider, cho xử lý lỗi/thử lại; không tự chuyển nơi lưu |

Tiêu chí bổ sung: hiển thị nơi lưu trước khi bắt đầu và trong chi tiết bản ghi; lựa chọn rõ ràng của người dùng không bị trạng thái kết nối cập nhật đè lên; mỗi bản ghi mới tính mặc định theo trạng thái kết nối lúc đó. Đổi lựa chọn không ảnh hưởng bản ghi cũ. Kết nối Google từ form không được âm thầm làm mất dữ liệu/file đã chọn; có cảnh báo và đường quay lại khi trình duyệt không giữ được file qua điều hướng OAuth.

Kiểm chứng: toàn bộ bảng trạng thái, đổi trạng thái kết nối trước/sau tạo bản ghi, B2 regression, cả hai ngôn ngữ và hai trình duyệt điện thoại.

## feat-032 — Tìm theo mã đơn/mã vận đơn

Tiêu chí nghiệm thu: tìm trên toàn bộ bản ghi của chủ sở hữu ở server, không chỉ trang hiện tại; phối hợp bộ lọc và pagination, đưa về trang đầu khi đổi tìm kiếm, có xóa tìm kiếm và trạng thái rỗng/lỗi rõ ràng. Giữ nguyên mã đã lưu. Khi triển khai, ghi rõ quy tắc khớp chính xác/một phần, chữ hoa/thường, khoảng trắng và ký tự đặc biệt trước khi thêm tham số vào contract; kiểm tra owner isolation và truy vấn có giới hạn. Không tự thêm quét barcode/OCR.

## feat-033 — Đối chiếu đóng gói và mở gói

Tiêu chí nghiệm thu: từ cùng mã tham chiếu, chọn được bản ghi đóng gói và mở gói để đối chiếu ảnh/video, thời gian và ghi chú. Điện thoại dùng hai phần/tab dễ chuyển; màn hình rộng có thể đặt cạnh nhau. Có trạng thái thiếu một phía hoặc nhiều bản ghi cùng mã, không tự ghép sai hay yêu cầu mã duy nhất. Chỉ xem bản ghi của chủ sở hữu; đối chiếu thủ công, chưa có AI đánh giá hư hỏng.

## feat-034 — Tiếp tục bản ghi đang dở

Tiêu chí nghiệm thu:

- Có mục “Đang làm dở” lấy các activity draft/uploading từ server; sau reload/mở lại có thể vào đúng bản ghi.
- Đối soát trạng thái server trước khi thử lại, giữ asset đã sẵn sàng, không tạo activity/asset trùng vì mất phản hồi.
- Khi cần, hướng dẫn chọn lại file còn thiếu và xác minh đúng file trước khi gắn lại asset/attempt. Sai file phải được báo rõ.
- Giữ nguyên provider của activity, kể cả khi mặc định mới đổi sang Drive. Thiếu phiên hoặc mất quyền Drive phải được xử lý trước khi tiếp tục.
- Không hứa upload nền sau khi đóng trình duyệt, khôi phục từng byte hoặc lưu toàn bộ video offline. Bản nháp chưa từng tạo ở server và lưu bền file cục bộ ngoài phạm vi ban đầu.
- Chỉ hoàn tất khi các asset đáp ứng điều kiện hiện hành; bản ghi không muốn tiếp tục có đường hủy theo chính sách đã có.

Kiểm chứng: reload sau tạo activity, mất phản hồi upload/finalize, file một phần đã ready, capability hết hạn, chọn lại đúng/sai file, hết phiên, provider lỗi và bản ghi bị hủy/xóa từ phiên khác. Kiểm tra cả B2 và Drive.

## Điều kiện hoàn thành và bàn giao

Mỗi feature triển khai phải có kết quả kiểm chứng trong `feature_list.json`, cập nhật `progress.md` và `session-handoff.md`. Chạy `./init.sh` trước khi sửa. Với web, chạy `npm run test --prefix web`, `npm run typecheck --prefix web`, `npm run build --prefix web`; với thay đổi backend chạy các lệnh tương ứng `--prefix backend` và integration liên quan theo `TESTING.md`. Mọi thay đổi contract phải cập nhật client, backend, tài liệu và test cùng nhau.

Chỉ đánh dấu done khi đạt tiêu chí, có bằng chứng hoặc ghi rõ kiểm tra không khả dụng và lý do theo AGENTS.md. Kết quả test cũ không chứng minh hỗ trợ điện thoại, tiếng Việt hay Drive mới. Phiên tài liệu này chỉ kiểm tra baseline, cấu trúc feature/phụ thuộc, liên kết và sự nhất quán của tài liệu; không được ghi các khả năng dự kiến thành đã triển khai.


## Cập nhật triển khai 2026-09-17

feat-013 đã qua kiểm chứng Drive thật có sự cho phép ngày 2026-09-16. feat-031 đã thêm chọn nơi lưu ưu tiên Drive, giữ lựa chọn rõ ràng khi kiểm tra lại, giữ nguyên provider sau tạo và tính lại mặc định cho bản ghi tiếp theo. API nơi lưu là snapshot: B2 dựa trên cấu hình, Drive dựa trên trạng thái kết nối; không bảo đảm dung lượng trống hay upload thành công. Luồng lỗi có hướng kiểm tra kết nối/dung lượng và thử lại. Kiểm thử tự động bao phủ bảng trạng thái; kiểm tra giao diện Safari iPhone/Chrome Android chưa thực hiện vì không có trình duyệt/thiết bị kết nối. Các phần “chưa triển khai” đầu tài liệu là bối cảnh tại thời điểm lập kế hoạch.


### feat-032 đã triển khai — 2026-09-17

Tìm theo một phần mã, không phân biệt hoa/thường theo PostgreSQL; bỏ khoảng trắng hai đầu, giữ khoảng trắng bên trong và dấu. %, _, dấu gạch chéo ngược và dấu nháy được tìm nguyên văn. Tối đa 160 ký tự; chuỗi rỗng bỏ lọc theo mã. Truy vấn server tìm trong toàn bộ bản ghi của chủ sở hữu trước khi phân trang và phối hợp các bộ lọc khác. Giao diện Việt/Anh có ô tìm và Xóa tìm kiếm; áp dụng/xóa đưa về trang đầu, phân trang giữ truy vấn. Mã đã lưu không đổi. Web/backend/integration đã kiểm chứng; chưa kiểm tra trực quan trên điện thoại thật.

### feat-033 đã triển khai — 2026-09-17

Đối chiếu dùng chính xác cùng mã tham chiếu, không phân biệt hoa/thường; khác với tìm kiếm một phần của feat-032. API chỉ trả ứng viên thuộc chủ sở hữu, loại bản ghi đã xóa, sắp mới nhất trước và giới hạn độc lập 50 bản ghi cho mỗi phía. Nếu một phía có nhiều ứng viên, người dùng phải tự chọn; ứng dụng chỉ chọn sẵn khi phía đó có đúng một ứng viên. Không lưu cặp ghép và không tự suy đoán.

Điện thoại chuyển giữa tab Đóng gói/Mở gói; màn hình rộng hiển thị hai cột. Mỗi phía cho xem thời gian, trạng thái, ghi chú, ảnh/video và tải bản gốc qua quyền truy cập hiện có của B2 hoặc Drive. Có trạng thái thiếu một phía, ứng viên bị giới hạn, bằng chứng chưa sẵn sàng và lỗi tải. Đối chiếu chỉ để xem, chưa có AI đánh giá. Kiểm thử tự động đã bao phủ lựa chọn nhiều ứng viên, thiếu phía, hai ngôn ngữ, giới hạn và cách ly chủ sở hữu; chưa kiểm tra trực quan trên thiết bị thật vì không có trình duyệt kết nối.

## Breakdown góp ý sản phẩm — 2026-09-17

Ba góp ý mới được tách thành các feature độc lập để triển khai tuần tự:

### feat-035 — Giải thích storage cá nhân qua Google Drive

Sau khi đăng nhập ứng dụng, người dùng cần thấy rõ Google Drive là lựa chọn lưu trữ cá nhân có thể kết nối, hiểu lợi ích và có nút kết nối/quản lý phù hợp. Nội dung phải phân biệt đăng nhập ứng dụng với cấp quyền Google, không bắt buộc kết nối và không thay đổi OAuth scope, credential hay provider pinning. Cần bao phủ trạng thái đã kết nối, chưa kết nối, cần kết nối lại, chưa cấu hình và cả hai ngôn ngữ.

### feat-036 — Dùng tên storage theo ngôn ngữ sản phẩm

Các bề mặt cho người dùng sẽ gọi B2 bằng tên trung tính như “Application storage / Bộ nhớ ứng dụng”, không hiển thị tên Backblaze. Google Drive vẫn giữ tên thật để người dùng nhận biết tài khoản và ranh giới quyền. Enum/API/log/provider kỹ thuật không đổi; cần audit copy, lỗi, badge, chi tiết activity và test VI/EN.

### feat-037 — Reset form và preview bằng chứng sau submit

Khi activity hoàn tất thành công, form tạo mới phải xóa metadata/file state để bản ghi kế tiếp bắt đầu sạch. Trạng thái thành công hiển thị reference và preview ảnh/video vừa xác minh, cùng đường dẫn xem chi tiết qua quyền bảo vệ hiện hành. Nếu upload/finalize thất bại, dữ liệu và khả năng recovery vẫn được giữ. Reset chỉ xảy ra sau completion thành công; cần kiểm tra focus, object URL cleanup, VI/EN và bố cục mobile.

Thứ tự đề xuất: `feat-035` → `feat-036` → `feat-037`. Ba feature này không mở rộng sang background upload, offline video, thay đổi OAuth scope hoặc đổi provider của activity cũ.
