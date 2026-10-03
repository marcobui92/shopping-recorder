import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { Select } from './components/ui/select'

export type Locale = 'vi' | 'en'

const translations: Record<string, string> = {
  'Copy Drive link': 'Sao chép liên kết Drive',
  'Open in Drive': 'Mở trong Drive',
  'Getting link…': 'Đang lấy liên kết…',
  'Drive link copied.': 'Đã sao chép liên kết Drive.',
  'Copy this link manually': 'Sao chép liên kết này thủ công',
  'Drive opens the current file. Google access is required.': 'Drive mở phiên bản hiện tại. Cần tài khoản Google có quyền truy cập.',
  'Unable to get the Drive link. Check the connection and try again.': 'Không thể lấy liên kết Drive. Kiểm tra kết nối rồi thử lại.',
  "Reload LinhCj's": "Tải lại LinhCj's",
  'Loading your workspace': 'Đang tải không gian làm việc',
  'Restoring session…': 'Đang khôi phục phiên…',
  'Unfinished work': 'Công việc chưa hoàn tất',
  'Continue a draft or interrupted upload without creating a duplicate record.': 'Tiếp tục bản nháp hoặc lần tải lên bị gián đoạn mà không tạo bản ghi trùng.',
  'Refresh unfinished work': 'Làm mới công việc chưa hoàn tất',
  'Loading unfinished work…': 'Đang tải công việc chưa hoàn tất…',
  'Unable to load unfinished work.': 'Không thể tải công việc chưa hoàn tất.',
  'Sign in again to recover unfinished work.': 'Đăng nhập lại để khôi phục công việc chưa hoàn tất.',
  'Unable to load unfinished activity.': 'Không thể tải hoạt động chưa hoàn tất.',
  'Unfinished activity': 'Hoạt động chưa hoàn tất',
  'Ready evidence is kept; only missing files need to be selected again.': 'Bằng chứng đã sẵn sàng được giữ lại; chỉ cần chọn lại tệp còn thiếu.',
  'Already verified': 'Đã xác minh',
  'Needs file': 'Cần tệp',
  'File selected': 'Đã chọn tệp',
  'Choose exact file': 'Chọn đúng tệp',
  'Retry upload': 'Thử tải lên lại',
  'The selected file does not match the original evidence. Choose the exact file.': 'Tệp đã chọn không khớp bằng chứng ban đầu. Hãy chọn đúng tệp.',
  'This upload is still active. Refresh after it expires, then retry.': 'Lần tải lên này vẫn đang hoạt động. Làm mới sau khi hết hạn rồi thử lại.',
  'The upload could not be recovered. Check the connection and retry.': 'Không thể khôi phục lần tải lên. Kiểm tra kết nối rồi thử lại.',
  'All evidence is already verified. You can complete this activity from its detail view.': 'Tất cả bằng chứng đã được xác minh. Bạn có thể hoàn tất hoạt động từ phần chi tiết.',
  'Cancel unfinished activity?': 'Hủy hoạt động chưa hoàn tất?',
  'Delete completed activity?': 'Xóa hoạt động đã hoàn tất?',
  'This will cancel the activity and remove uploaded evidence.': 'Hoạt động sẽ bị hủy và bằng chứng đã tải lên sẽ bị xóa.',
  'This permanently hides the activity and deletes its evidence. This cannot be undone.': 'Hoạt động sẽ bị ẩn vĩnh viễn và bằng chứng bị xóa. Không thể hoàn tác.',
  'Keep': 'Giữ lại',
  'Confirm': 'Xác nhận',
  'Delete unfinished activity?': 'Xóa hoạt động chưa hoàn tất?',
  'This will cancel the unfinished activity and remove uploaded evidence.': 'Hoạt động chưa hoàn tất sẽ bị hủy và bằng chứng đã tải lên sẽ bị xóa.',
  "Search order or shipment reference": "Tìm mã đơn hoặc mã vận đơn",
  "Enter all or part of a reference": "Nhập toàn bộ hoặc một phần mã",
  "Clear search": "Xóa tìm kiếm",
  "Search all your records, ignoring letter case. Other filters still apply.": "Tìm trong toàn bộ bản ghi của bạn, không phân biệt chữ hoa/thường. Các bộ lọc khác vẫn áp dụng.",
  "Filter recorder history": "Lọc lịch sử bản ghi",
  "Unable to load recorder history.": "Không thể tải lịch sử bản ghi.",
  "Sign in again to search your records.": "Đăng nhập lại để tìm bản ghi của bạn.",
  "Check your search and filter values, then retry.": "Kiểm tra nội dung tìm kiếm và bộ lọc rồi thử lại.",

  'The browser could not reach the Google Drive upload service. Check the connection and retry.': 'Trình duyệt không thể kết nối dịch vụ tải lên Google Drive. Kiểm tra kết nối rồi thử lại.',
  'The browser could not reach application storage. Check the connection and retry.': 'Trình duyệt không thể kết nối bộ nhớ ứng dụng. Kiểm tra kết nối rồi thử lại.', 
  "Choose storage": "Chọn nơi lưu",
  "Application storage (Backblaze B2)": "Bộ nhớ ứng dụng (Backblaze B2)",
  "Application storage": "Bộ nhớ ứng dụng",
  "Checking storage…": "Đang kiểm tra nơi lưu…",
  "Refresh storage": "Kiểm tra lại nơi lưu",
  "Manage Google Drive": "Quản lý Google Drive",
  "Start another record": "Tạo bản ghi tiếp theo",
  "Unable to check storage. Retry without losing your selected files.": "Không thể kiểm tra nơi lưu. Thử lại vẫn giữ các tệp đã chọn.",
  "Selected storage is unavailable. Connect Google Drive or choose available application storage. Your files are kept here.": "Nơi lưu đã chọn chưa khả dụng. Kết nối Google Drive hoặc chọn bộ nhớ ứng dụng khả dụng. Các tệp đã chọn vẫn được giữ tại đây.",
  "This record keeps its storage location. Retry here after restoring access.": "Bản ghi này giữ nguyên nơi lưu. Thử lại tại đây sau khi khôi phục quyền truy cập.",
  "Storage failed. Check the connection or free space, then retry. This record keeps its storage location.": "Lưu trữ gặp lỗi. Kiểm tra kết nối hoặc dung lượng trống rồi thử lại. Bản ghi này giữ nguyên nơi lưu.",

  'Reconnect Google Drive to restore access.': 'Kết nối lại Google Drive để khôi phục quyền truy cập.',
  'Google Drive is temporarily unavailable.': 'Google Drive tạm thời không khả dụng.',
  'Google Drive connected.': 'Đã kết nối Google Drive.',
  'Google connection cancelled.': 'Đã hủy kết nối Google.',
  'Google connection failed. Please retry.': 'Kết nối Google thất bại. Hãy thử lại.',
  'Checking Google Drive…': 'Đang kiểm tra Google Drive…',
  'Google Drive is not configured.': 'Google Drive chưa được cấu hình.',
  'Google Drive is not connected.': 'Chưa kết nối Google Drive.',
  'Unable to update Google Drive. Please retry.': 'Không thể cập nhật kết nối Google Drive. Hãy thử lại.',
  'Reconnect or replace Google': 'Kết nối lại hoặc đổi tài khoản Google',
  'Connect Google Drive': 'Kết nối Google Drive', 'Unlink Google Drive': 'Ngắt kết nối Google Drive',
  'Set up your personal storage': 'Thiết lập nơi lưu trữ cá nhân',
  'Connect Google Drive after signing in to keep your evidence in your own personal storage. You can also use application storage without connecting Google.': 'Sau khi đăng nhập, kết nối Google Drive để lưu bằng chứng trong nơi lưu trữ cá nhân của bạn. Bạn cũng có thể dùng bộ nhớ ứng dụng mà không cần kết nối Google.',
  'Submitted evidence': 'Bằng chứng đã gửi',
  'Submitted evidence preview': 'Xem trước bằng chứng đã gửi',
  'Record completed': 'Bản ghi đã hoàn tất',
  'Evidence verified and secured': 'Bằng chứng đã xác minh và bảo vệ',
  'Drive files will be kept. Reconnect the original account to access old evidence.': 'Tệp trên Drive sẽ được giữ lại. Kết nối lại đúng tài khoản để truy cập bằng chứng cũ.',
  'Opening Google leaves this page. Finish your upload first; unsaved fields and selected files may be lost. Replacing the account does not move old evidence.': 'Mở Google sẽ rời trang này. Hãy hoàn tất tải lên trước; nội dung chưa lưu và tệp đã chọn có thể bị mất. Đổi tài khoản không di chuyển bằng chứng cũ.',
  'Continue': 'Tiếp tục', 'Cancel': 'Hủy',

  'Evidence recorder': 'Bộ ghi nhận bằng chứng',
  'Proof for every packing handoff.': 'Minh chứng cho mọi lần bàn giao đóng gói.',
  'Capture packing and unpacking evidence, verify every file, and keep each operational record accountable.': 'Ghi lại bằng chứng đóng gói và mở gói, xác minh từng tệp và lưu lại đầy đủ trách nhiệm cho mỗi hoạt động.',
  'File-level verification': 'Xác minh từng tệp', 'Private B2 storage': 'Lưu trữ B2 riêng tư', 'Private application storage': 'Bộ nhớ ứng dụng riêng tư',
  'Workspace': 'Không gian làm việc', 'Private evidence': 'Bằng chứng riêng tư',
  'Operational evidence workspace': 'Không gian bằng chứng vận hành', 'Encrypted in transit · Owner-authorized access': 'Mã hóa khi truyền · Chỉ chủ sở hữu được truy cập',
  'Packing & unpacking evidence': 'Bằng chứng đóng gói và mở gói',
  'optional': 'không bắt buộc',
  'Signed in as': 'Đã đăng nhập với tên', 'Session protected': 'Phiên được bảo vệ', 'Sign out': 'Đăng xuất',
  'Open profile': 'Mở hồ sơ', 'Profile menu': 'Menu hồ sơ',
  'Settings': 'Cài đặt',
  'Manage your account, storage, and evidence preferences.': 'Quản lý tài khoản, nơi lưu trữ và tùy chọn bằng chứng.',
  'Google Drive': 'Google Drive',
  'Manage your Google Drive connection for personal evidence storage.': 'Quản lý kết nối Google Drive để lưu bằng chứng cá nhân.',
  'Auto-delete evidence after (days)': 'Tự động xóa bằng chứng sau (ngày)',
  'Completed records keep their metadata, but stored files are deleted after this period. Choose 1 to 3650 days.': 'Bản ghi hoàn tất vẫn giữ thông tin, nhưng tệp sẽ bị xóa sau thời gian này. Chọn từ 1 đến 3650 ngày.',
  'Save settings': 'Lưu cài đặt',
  'Settings saved.': 'Đã lưu cài đặt.',
  'Unable to load settings.': 'Không thể tải cài đặt.',
  'Unable to save settings.': 'Không thể lưu cài đặt.',
  'Enter a number of days between 1 and 3650.': 'Nhập số ngày từ 1 đến 3650.',
  'Loading settings…': 'Đang tải cài đặt…',
  'days': 'ngày',
  'Operator access': 'Quyền truy cập nhân viên', 'Welcome back to your evidence workspace.': 'Chào mừng trở lại không gian bằng chứng.',
  'Create your operator workspace.': 'Tạo không gian làm việc của bạn.', 'Every activity is linked to your account. Only you can review, correct, or remove the evidence you record.': 'Mọi hoạt động được liên kết với tài khoản của bạn. Chỉ bạn có thể xem, sửa hoặc xóa bằng chứng đã ghi.',
  'Persistent, owner-authorized session': 'Phiên bền vững, chỉ chủ sở hữu được cấp quyền', 'Sign in': 'Đăng nhập', 'Create account': 'Tạo tài khoản',
  'Enter your operator credentials to continue.': 'Nhập thông tin đăng nhập để tiếp tục.', 'Email is optional and only used for account recovery.': 'Email không bắt buộc và chỉ dùng để khôi phục tài khoản.',
  "LinhCj's records packing and unpacking evidence with private photos and videos.": "LinhCj's ghi nhận bằng chứng đóng gói và mở gói bằng ảnh, video được lưu riêng tư.",
  'Username': 'Tên người dùng', 'Password': 'Mật khẩu', 'At least 6 characters': 'Ít nhất 6 ký tự', 'Please wait…': 'Vui lòng chờ…',
  'Remember username and password': 'Ghi nhớ tên đăng nhập và mật khẩu', 'Your browser password manager stores the password securely.': 'Trình quản lý mật khẩu của trình duyệt sẽ lưu mật khẩu an toàn.',
  'Create an account': 'Tạo tài khoản mới', 'Use an existing account': 'Dùng tài khoản hiện có',
  'Authentication failed.': 'Xác thực không thành công.', 'Unable to sign out.': 'Không thể đăng xuất.',
  'New record': 'Bản ghi mới', 'Private · Backblaze B2': 'Riêng tư · Backblaze B2', 'Document a handoff': 'Ghi nhận một lần bàn giao',
  'Add the handoff context, then review every photo and video before starting the secure upload.': 'Thêm thông tin bàn giao, sau đó xem lại từng ảnh và video trước khi tải lên an toàn.',
  'Activity details': 'Thông tin hoạt động', 'Describe what this evidence belongs to.': 'Mô tả nội dung của bằng chứng này.', 'Operation': 'Hoạt động',
  'file': 'tệp', 'files': 'tệp', 'ready for review': 'sẵn sàng xem lại', 'Choose again to replace': 'Chọn lại để thay thế', 'total': 'tổng cộng', 'Photos and videos': 'Ảnh và video', 'selected': 'đã chọn', 'Open photos full-size and play videos to confirm the evidence is usable.': 'Mở ảnh toàn màn hình và phát video để kiểm tra bằng chứng có thể sử dụng.', 'Check focus, lighting and identifiers': 'Kiểm tra độ nét, ánh sáng và mã nhận diện',
  'Add evidence options': 'Tùy chọn thêm bằng chứng', 'Take photo': 'Chụp ảnh', 'Record video': 'Quay video', 'Choose files': 'Chọn tệp', 'Possible duplicate:': 'Có thể bị trùng:',
  'Packing': 'Đóng gói', 'Unpacking': 'Mở gói', 'Reference': 'Mã tham chiếu', 'Order, shipment or package ID': 'Mã đơn, lô hàng hoặc kiện hàng',
  'Use an identifier your team can search later.': 'Dùng mã để nhóm có thể tìm lại sau.', 'Notes': 'Ghi chú', 'Seal condition, package state, or handoff context': 'Tình trạng niêm phong, kiện hàng hoặc thông tin bàn giao',
  'Evidence files': 'Tệp bằng chứng', 'Make sure labels, seals and package condition are clearly visible.': 'Đảm bảo nhãn, niêm phong và tình trạng kiện hàng được nhìn rõ.', 'Clear all': 'Xóa tất cả', 'Remove': 'Xóa', 'Unable to remove failed evidence.': 'Không thể xóa bằng chứng lỗi.',
  'Review & upload': 'Xem lại và tải lên', 'Add evidence': 'Thêm bằng chứng', 'Review selected evidence': 'Xem lại bằng chứng đã chọn', 'Drop evidence here or choose files': 'Thả bằng chứng vào đây hoặc chọn tệp',
  'No evidence selected yet': 'Chưa chọn bằng chứng', 'Files are hashed, uploaded privately, then verified before completion.': 'Tệp được băm, tải lên riêng tư rồi xác minh trước khi hoàn tất.',
  'Review complete · Upload': 'Đã xem xong · Tải lên', 'Starting…': 'Đang bắt đầu…', 'Complete record': 'Hoàn tất bản ghi', 'Reset form': 'Đặt lại biểu mẫu', 'Evidence record completed and secured.': 'Bản ghi bằng chứng đã hoàn tất và được bảo vệ.',
  'Select at least one image or video.': 'Hãy chọn ít nhất một ảnh hoặc video.', 'Unsupported file type:': 'Định dạng tệp không được hỗ trợ:', 'Upload failed.': 'Tải lên không thành công.', 'Retry': 'Thử lại', 'Verified': 'Đã xác minh',
  'Ready to upload': 'Sẵn sàng tải lên', 'Calculating checksum': 'Đang tính mã kiểm tra', 'Preparing storage': 'Đang chuẩn bị nơi lưu', 'Uploading': 'Đang tải lên', 'Verifying file': 'Đang xác minh tệp', 'Needs attention': 'Cần xử lý',
  'Evidence archive': 'Kho bằng chứng', 'Recorded handoffs': 'Các lần bàn giao đã ghi', 'Search activity history and review verified evidence.': 'Tìm trong lịch sử và xem bằng chứng đã xác minh.',
  'Recorder workspace sections': 'Các khu vực không gian ghi nhận',
  'record': 'bản ghi', 'records': 'bản ghi',
  'Apply filters': 'Áp dụng bộ lọc', 'All': 'Tất cả', 'Newest first': 'Mới nhất trước', 'Oldest first': 'Cũ nhất trước', 'Occurred from': 'Từ thời điểm', 'Occurred to': 'Đến thời điểm',
  'Loading evidence records…': 'Đang tải bản ghi bằng chứng…', 'No evidence records match these filters.': 'Không có bản ghi phù hợp với bộ lọc.', 'View evidence': 'Xem bằng chứng', 'Previous': 'Trước', 'Next': 'Sau',
  'Close detail': 'Đóng chi tiết', 'Unreferenced activity': 'Hoạt động chưa có mã', 'Status': 'Trạng thái', 'Occurred': 'Thời điểm', 'Storage': 'Nơi lưu', 'Save correction': 'Lưu chỉnh sửa', 'Saving…': 'Đang lưu…', 'Cancel activity': 'Hủy hoạt động', 'Delete activity': 'Xóa hoạt động',
  'Order': 'Thứ tự', 'Draft': 'Bản nháp', 'Complete': 'Hoàn tất', 'Expired': 'Đã hết hạn', 'Cancelled': 'Đã hủy', 'Page': 'Trang', 'of': 'trên', 'Close': 'Đóng', 'Correct activity metadata': 'Chỉnh sửa thông tin hoạt động.', 'Unable to load activity detail.': 'Không thể tải chi tiết hoạt động.', 'Unable to cancel the activity.': 'Không thể hủy hoạt động.', 'Loading activity detail…': 'Đang tải chi tiết hoạt động…',
  'Evidence expired': 'Bằng chứng đã hết hạn',
  'Stored evidence expired after 30 days and is no longer available. The record metadata is preserved.': 'Bằng chứng lưu trữ đã hết hạn sau 30 ngày và không còn khả dụng. Thông tin bản ghi vẫn được giữ lại.',
  'Open viewer': 'Mở trình xem', 'Download original': 'Tải bản gốc', 'Evidence viewer': 'Trình xem bằng chứng', 'Activity detail': 'Chi tiết hoạt động', 'Zoom out': 'Thu nhỏ', 'Zoom in': 'Phóng to', 'Close viewer': 'Đóng trình xem', 'Previous evidence': 'Bằng chứng trước', 'Next evidence': 'Bằng chứng tiếp theo',
  'Audit trail': 'Lịch sử thay đổi', 'No corrections or lifecycle actions recorded.': 'Chưa có chỉnh sửa hoặc thao tác vòng đời nào.', 'This activity has no evidence files yet.': 'Hoạt động này chưa có tệp bằng chứng.', 'Unable to load this evidence. Check your session or storage connection.': 'Không thể tải bằng chứng. Hãy kiểm tra phiên hoặc kết nối nơi lưu.',
  'Activity deleted. Some storage cleanup remains pending.': 'Hoạt động đã xóa. Một phần dọn dẹp nơi lưu vẫn đang chờ xử lý.', 'Activity and stored evidence deleted.': 'Hoạt động và bằng chứng đã lưu đã được xóa.', 'Unable to delete the activity.': 'Không thể xóa hoạt động.', 'Unable to start this record.': 'Không thể bắt đầu bản ghi.', 'Unable to complete this record.': 'Không thể hoàn tất bản ghi.', 'Unknown type': 'Không rõ định dạng',
  'This page does not exist.': 'Trang này không tồn tại.', "Return to the LinhCj's workspace.": "Quay lại không gian LinhCj's.", 'Go home': 'Về trang chính',
}

interface I18nValue { locale: Locale; setLocale: (locale: Locale) => void; t: (value: string) => string }
const I18nContext = createContext<I18nValue>({ locale: 'en', setLocale: () => undefined, t: (value) => value })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try { return localStorage.getItem('shopping-recorder-locale') === 'en' ? 'en' : 'vi' } catch { return 'vi' }
  })
  useEffect(() => {
    document.documentElement.lang = locale
    try { localStorage.setItem('shopping-recorder-locale', locale) } catch { /* preference is optional */ }
  }, [locale])
  const value = useMemo(() => ({ locale, setLocale, t: (value: string) => locale === 'vi' ? (translations[value] ?? value) : value }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() { return useContext(I18nContext) }

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n()
  return <div className="[&_[role=listbox]]:right-0 [&_[role=listbox]]:w-16">
    <Select aria-label="Language" className="h-6 w-10 border-0 px-0.5 text-base shadow-none" id="language-switcher" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
      <option aria-label="Tiếng Việt" value="vi">🇻🇳</option>
      <option aria-label="English" value="en">🇺🇸</option>
    </Select>
  </div>
}
