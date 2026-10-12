-- BGK/Host được xem phiếu chấm; thí sinh chỉ xem khi Host đã công bố kết quả.
-- Giữ nguyên chính sách ghi điểm: thí sinh không được sửa hoặc nộp điểm.
DROP POLICY IF EXISTS ra_score_read ON public.ra_scores;
CREATE POLICY ra_score_read ON public.ra_scores
FOR SELECT TO authenticated
USING (
  public.ra_is_judge(room_id)
  OR (
    EXISTS (
      SELECT 1 FROM public.ra_members m
      JOIN public.ra_rooms r ON r.id = m.room_id
      WHERE m.room_id = ra_scores.room_id
        AND m.user_id = auth.uid()
        AND m.role = 'candidate'
        AND r.phase = 'results'
    )
  )
);
NOTIFY pgrst, 'reload schema';
