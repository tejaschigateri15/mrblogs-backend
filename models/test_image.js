import mongoose from "mongoose";

const imagesSchema = new mongoose.Schema({
    public_id: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: true
    }
});

const TestImage = mongoose.model("TestImage", imagesSchema);
export default TestImage;
