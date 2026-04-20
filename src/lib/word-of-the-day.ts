export function wordOfTheDayKey(date: Date = new Date()): number {
	return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export function pickWordOfTheDayIndex(dayKey: number, poolSize: number): number {
	if (poolSize <= 0) return 0;
	return ((dayKey % poolSize) + poolSize) % poolSize;
}
