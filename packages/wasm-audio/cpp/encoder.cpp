#include <cstdint>
#include <vector>

extern "C" {
  struct EncoderState {
    int sample_rate;
    int channels;
    int bitrate;
  };

  EncoderState* encoder_create(int sample_rate, int channels, int bitrate) {
    auto* state = new EncoderState();
    state->sample_rate = sample_rate;
    state->channels = channels;
    state->bitrate = bitrate;
    return state;
  }

  void encoder_destroy(EncoderState* state) {
    delete state;
  }

  int encoder_process_pcm(EncoderState* state, const int16_t* input, int input_samples, uint8_t* output, int output_capacity) {
    if (state == nullptr || input == nullptr || output == nullptr || input_samples <= 0 || output_capacity <= 0) {
      return -1;
    }

    const int write_size = input_samples < output_capacity ? input_samples : output_capacity;
    for (int i = 0; i < write_size; i++) {
      output[i] = static_cast<uint8_t>((input[i] >> 8) & 0xFF);
    }
    return write_size;
  }
}
