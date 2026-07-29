#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "onnxruntime_c_api.h"

typedef struct RapidOrtRuntime {
  HMODULE module;
  const OrtApi *api;
  OrtEnv *env;
} RapidOrtRuntime;

typedef struct RapidOrtSession {
  RapidOrtRuntime *runtime;
  OrtSessionOptions *options;
  OrtSession *session;
  OrtAllocator *allocator;
  char *input_name;
  char *output_name;
} RapidOrtSession;

static int set_error(char *error, size_t capacity, const char *message) {
  if (error != NULL && capacity > 0) {
    snprintf(error, capacity, "%s", message != NULL ? message : "unknown ONNX Runtime error");
    error[capacity - 1] = '\0';
  }
  return 1;
}

static int set_status_error(const OrtApi *api, OrtStatus *status, char *error, size_t capacity) {
  if (status == NULL) {
    return 0;
  }
  const char *message = api->GetErrorMessage(status);
  set_error(error, capacity, message);
  api->ReleaseStatus(status);
  return 1;
}

__declspec(dllexport) int rapid_ort_runtime_create(
    const wchar_t *dll_path,
    RapidOrtRuntime **out_runtime,
    char *error,
    size_t error_capacity) {
  if (dll_path == NULL || out_runtime == NULL) {
    return set_error(error, error_capacity, "invalid runtime arguments");
  }
  *out_runtime = NULL;

  HMODULE module = LoadLibraryExW(
      dll_path,
      NULL,
      LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
  if (module == NULL) {
    return set_error(error, error_capacity, "could not load the vendored onnxruntime.dll");
  }

  typedef const OrtApiBase *(ORT_API_CALL *GetApiBaseFn)(void);
  GetApiBaseFn get_api_base = (GetApiBaseFn)GetProcAddress(module, "OrtGetApiBase");
  if (get_api_base == NULL) {
    FreeLibrary(module);
    return set_error(error, error_capacity, "onnxruntime.dll does not export OrtGetApiBase");
  }

  const OrtApiBase *api_base = get_api_base();
  const OrtApi *api = api_base != NULL ? api_base->GetApi(ORT_API_VERSION) : NULL;
  if (api == NULL) {
    FreeLibrary(module);
    return set_error(error, error_capacity, "onnxruntime.dll does not support API version 22");
  }

  RapidOrtRuntime *runtime = (RapidOrtRuntime *)calloc(1, sizeof(RapidOrtRuntime));
  if (runtime == NULL) {
    FreeLibrary(module);
    return set_error(error, error_capacity, "could not allocate ONNX Runtime state");
  }
  runtime->module = module;
  runtime->api = api;
  if (set_status_error(
          api,
          api->CreateEnv(ORT_LOGGING_LEVEL_WARNING, "pdf-editor-rapidocr", &runtime->env),
          error,
          error_capacity)) {
    free(runtime);
    FreeLibrary(module);
    return 1;
  }

  *out_runtime = runtime;
  return 0;
}

__declspec(dllexport) void rapid_ort_runtime_destroy(RapidOrtRuntime *runtime) {
  if (runtime == NULL) {
    return;
  }
  if (runtime->env != NULL) {
    runtime->api->ReleaseEnv(runtime->env);
  }
  HMODULE module = runtime->module;
  free(runtime);
  if (module != NULL) {
    FreeLibrary(module);
  }
}

__declspec(dllexport) int rapid_ort_session_create(
    RapidOrtRuntime *runtime,
    const wchar_t *model_path,
    RapidOrtSession **out_session,
    char *error,
    size_t error_capacity) {
  if (runtime == NULL || model_path == NULL || out_session == NULL) {
    return set_error(error, error_capacity, "invalid session arguments");
  }
  *out_session = NULL;

  RapidOrtSession *session = (RapidOrtSession *)calloc(1, sizeof(RapidOrtSession));
  if (session == NULL) {
    return set_error(error, error_capacity, "could not allocate ONNX session state");
  }
  session->runtime = runtime;
  const OrtApi *api = runtime->api;

  if (set_status_error(api, api->CreateSessionOptions(&session->options), error, error_capacity) ||
      set_status_error(api, api->SetIntraOpNumThreads(session->options, 1), error, error_capacity) ||
      set_status_error(api, api->SetInterOpNumThreads(session->options, 1), error, error_capacity) ||
      set_status_error(
          api,
          api->SetSessionGraphOptimizationLevel(session->options, ORT_ENABLE_ALL),
          error,
          error_capacity) ||
      set_status_error(
          api,
          api->CreateSession(runtime->env, model_path, session->options, &session->session),
          error,
          error_capacity) ||
      set_status_error(api, api->GetAllocatorWithDefaultOptions(&session->allocator), error, error_capacity) ||
      set_status_error(
          api,
          api->SessionGetInputName(session->session, 0, session->allocator, &session->input_name),
          error,
          error_capacity) ||
      set_status_error(
          api,
          api->SessionGetOutputName(session->session, 0, session->allocator, &session->output_name),
          error,
          error_capacity)) {
    if (session->input_name != NULL) {
      api->AllocatorFree(session->allocator, session->input_name);
    }
    if (session->output_name != NULL) {
      api->AllocatorFree(session->allocator, session->output_name);
    }
    if (session->session != NULL) {
      api->ReleaseSession(session->session);
    }
    if (session->options != NULL) {
      api->ReleaseSessionOptions(session->options);
    }
    free(session);
    return 1;
  }

  *out_session = session;
  return 0;
}

__declspec(dllexport) void rapid_ort_session_destroy(RapidOrtSession *session) {
  if (session == NULL) {
    return;
  }
  const OrtApi *api = session->runtime->api;
  if (session->input_name != NULL) {
    api->AllocatorFree(session->allocator, session->input_name);
  }
  if (session->output_name != NULL) {
    api->AllocatorFree(session->allocator, session->output_name);
  }
  if (session->session != NULL) {
    api->ReleaseSession(session->session);
  }
  if (session->options != NULL) {
    api->ReleaseSessionOptions(session->options);
  }
  free(session);
}

__declspec(dllexport) int rapid_ort_session_run_f32(
    RapidOrtSession *session,
    float *input_data,
    size_t input_length,
    const int64_t *input_dims,
    size_t input_rank,
    float **out_data,
    size_t *out_length,
    int64_t **out_dims,
    size_t *out_rank,
    char *error,
    size_t error_capacity) {
  if (session == NULL || input_data == NULL || input_dims == NULL || input_rank == 0 ||
      out_data == NULL || out_length == NULL || out_dims == NULL || out_rank == NULL) {
    return set_error(error, error_capacity, "invalid inference arguments");
  }
  *out_data = NULL;
  *out_length = 0;
  *out_dims = NULL;
  *out_rank = 0;

  const OrtApi *api = session->runtime->api;
  OrtMemoryInfo *memory_info = NULL;
  OrtValue *input = NULL;
  OrtValue *output = NULL;
  OrtTensorTypeAndShapeInfo *shape = NULL;
  int result = 1;

  if (set_status_error(
          api,
          api->CreateCpuMemoryInfo(OrtArenaAllocator, OrtMemTypeDefault, &memory_info),
          error,
          error_capacity) ||
      set_status_error(
          api,
          api->CreateTensorWithDataAsOrtValue(
              memory_info,
              input_data,
              input_length * sizeof(float),
              input_dims,
              input_rank,
              ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,
              &input),
          error,
          error_capacity)) {
    goto cleanup;
  }

  const char *input_names[] = {session->input_name};
  const char *output_names[] = {session->output_name};
  if (set_status_error(
          api,
          api->Run(
              session->session,
              NULL,
              input_names,
              (const OrtValue *const *)&input,
              1,
              output_names,
              1,
              &output),
          error,
          error_capacity) ||
      set_status_error(api, api->GetTensorTypeAndShape(output, &shape), error, error_capacity) ||
      set_status_error(api, api->GetDimensionsCount(shape, out_rank), error, error_capacity) ||
      set_status_error(api, api->GetTensorShapeElementCount(shape, out_length), error, error_capacity)) {
    goto cleanup;
  }

  *out_dims = (int64_t *)malloc(*out_rank * sizeof(int64_t));
  *out_data = (float *)malloc(*out_length * sizeof(float));
  if (*out_dims == NULL || *out_data == NULL) {
    set_error(error, error_capacity, "could not allocate inference output");
    goto cleanup;
  }
  if (set_status_error(
          api,
          api->GetDimensions(shape, *out_dims, *out_rank),
          error,
          error_capacity)) {
    goto cleanup;
  }

  void *tensor_data = NULL;
  if (set_status_error(api, api->GetTensorMutableData(output, &tensor_data), error, error_capacity)) {
    goto cleanup;
  }
  memcpy(*out_data, tensor_data, *out_length * sizeof(float));
  result = 0;

cleanup:
  if (result != 0) {
    free(*out_data);
    free(*out_dims);
    *out_data = NULL;
    *out_dims = NULL;
    *out_length = 0;
    *out_rank = 0;
  }
  if (shape != NULL) {
    api->ReleaseTensorTypeAndShapeInfo(shape);
  }
  if (output != NULL) {
    api->ReleaseValue(output);
  }
  if (input != NULL) {
    api->ReleaseValue(input);
  }
  if (memory_info != NULL) {
    api->ReleaseMemoryInfo(memory_info);
  }
  return result;
}

__declspec(dllexport) void rapid_ort_free_output(float *data, int64_t *dims) {
  free(data);
  free(dims);
}
