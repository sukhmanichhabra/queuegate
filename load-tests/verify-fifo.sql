-- Double admission check
SELECT COUNT(*) as double_admits 
FROM (
  SELECT session_id 
  FROM queue_entries 
  WHERE event_id = '00000000-0000-0000-0000-000000000002' AND status = 'ADMITTED' 
  GROUP BY session_id 
  HAVING COUNT(*) > 1
) as duplicates;

-- FIFO inversion check
WITH Admitted AS (
    SELECT session_id, joined_at, admitted_at
    FROM queue_entries
    WHERE event_id = '00000000-0000-0000-0000-000000000002' AND status = 'ADMITTED'
)
SELECT COUNT(*) as fifo_violations
FROM Admitted a1
JOIN Admitted a2 ON a1.joined_at < a2.joined_at AND a1.admitted_at > a2.admitted_at;

-- Queue summary
SELECT status, COUNT(*) as count 
FROM queue_entries 
WHERE event_id = '00000000-0000-0000-0000-000000000002' 
GROUP BY status;
