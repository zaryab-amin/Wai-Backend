

const getStartOfDay = (date) => new Date(date.setHours(0, 0, 0, 0));

const getPastSevenDays = () => {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push({
      start: getStartOfDay(new Date(date)),
      end: new Date(getStartOfDay(new Date(date)).setDate(date.getDate() + 1))
    });
  }
  return dates;
};

const getPastSevenWeeks = () => {
  const weeks = [];
  for (let i = 6; i >= 0; i--) {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - (i * 7) - startOfWeek.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7); // 7 days in a week
    weeks.push({
      start: getStartOfDay(startOfWeek),
      end: getStartOfDay(endOfWeek)
    });
  }
  return weeks;
};

const getPastTwelveMonths = () => {
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const startOfMonth = new Date();
    startOfMonth.setMonth(startOfMonth.getMonth() - i, 1); // Set to first day of the month
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1); // Set to the next month
    months.push({
      start: getStartOfDay(startOfMonth),
      end: getStartOfDay(endOfMonth)
    });
  }
  return months;
};

const calculateLectureDuration = (lectureContent) => {
  const wordsPerMinute = 200;
  const noOfWords = lectureContent?.split(/\s/g).length
  const minutes = noOfWords / wordsPerMinute
  const readTime = Math.ceil(minutes);
  return readTime;
}

module.exports = {
  getStartOfDay,
  getPastSevenDays,
  getPastSevenWeeks,
  getPastTwelveMonths,
  calculateLectureDuration,
}