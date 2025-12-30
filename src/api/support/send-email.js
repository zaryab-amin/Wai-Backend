import { sendSupportForm } from "../services/emails/emailProvider";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { firstName, lastName, email, subject, message } = req.body;

  try {
    await sendSupportForm({ firstName, lastName, email, subject, message });
    res.status(200).json({ success: true, message: "Support request sent!" });
  } catch (error) {
    console.error("Support Form API Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
}
