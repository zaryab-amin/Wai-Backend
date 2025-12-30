
exports.getCourseProgress = (purchaseCourse) => {
  const totalLectures = purchaseCourse?.course?.lectures?.length;

  const completedLectures = purchaseCourse?.lectures?.filter(lecture => lecture?.progress === 100).length;

  const totalProgress = totalLectures > 0 ? (completedLectures / totalLectures) * 100 : 0;

  return totalProgress || 0;
}