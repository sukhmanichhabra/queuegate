-- KEYS[1] = sorted set key e.g. "event:{id}:queue"
-- KEYS[2] = admitted count key e.g. "event:{id}:admitted_count"
-- ARGV[1] = number of slots to admit (computed from admission_rate_per_min / 30 per tick)
-- ARGV[2] = event capacity (max total admitted)
-- Returns: array of admitted session IDs (may be empty)

local queue_key = KEYS[1]
local count_key = KEYS[2]
local slots = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])

local admitted_so_far = tonumber(redis.call('GET', count_key) or 0)
local remaining_capacity = capacity - admitted_so_far

if remaining_capacity <= 0 then
  return {}
end

local to_admit = math.min(slots, remaining_capacity)
-- Get the lowest-score (earliest) members
local candidates = redis.call('ZRANGE', queue_key, 0, to_admit - 1)

if #candidates == 0 then
  return {}
end

-- Remove them from the sorted set atomically
redis.call('ZREM', queue_key, unpack(candidates))
-- Increment the admitted count
redis.call('INCRBY', count_key, #candidates)

return candidates
