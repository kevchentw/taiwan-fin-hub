import { decode as decodeJpeg } from "jpeg-js";

export interface ValidateNumberOcrResult {
  text: string;
  confidence: number;
  width: number;
  height: number;
  digits: Array<{
    value: string;
    confidence: number;
  }>;
}

export type ValidateNumberImageInput = Blob | ArrayBuffer | Uint8Array;

type Box = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  position?: number;
};

const SAMPLE_WIDTH = 5;
const SAMPLE_HEIGHT = 7;

const DIGIT_PROTOTYPES: Array<{ value: string; position: number; sample: number[] }> = [{"value":"0","position":0,"sample":[0.042,0.117,0.158,0.158,0.306,0.383,0.417,0.45,0.392,0.375,0.644,0.35,0.488,0.438,0.063,0.5,0.2,0.383,0.458,0.188,0.608,0.225,0.456,0.438,0.094,0.592,0.258,0.383,0.333,0,0.194,0.094,0.094,0.094,0.031]},{"value":"0","position":1,"sample":[0.165,0.248,0.237,0.122,0.083,0.297,0.228,0.297,0.184,0.188,0.247,0.172,0.309,0.131,0.385,0.234,0.284,0.397,0.119,0.349,0.441,0.191,0.294,0.156,0.286,0.349,0.197,0.181,0.237,0.24,0.199,0.104,0.026,0.08,0.024]},{"value":"0","position":2,"sample":[0.417,0.383,0.258,0.075,0.417,0.594,0.575,0.725,0.4,0.85,0.717,0.64,0.753,0.34,0.8,0.813,0.6,0.725,0.35,0.7,0.65,0.587,0.693,0.407,0.727,0.563,0.55,0.475,0.3,0.7,0.225,0.28,0.06,0.045,0.33]},{"value":"0","position":3,"sample":[0.083,0.083,0.069,0.299,0.063,0.285,0.132,0.229,0.396,0.063,0.271,0.194,0.021,0,0,0.021,0.021,0.063,0.188,0.042,0.167,0,0.063,0.319,0.132,0.34,0.188,0.049,0.326,0.174,0.132,0.125,0.042,0.125,0.021]},{"value":"0","position":4,"sample":[0.354,0.492,0.317,0,0.192,0.531,0.587,0.45,0.081,0.381,0.469,0.375,0.3,0.075,0.125,0.442,0.467,0.32,0.12,0.18,0.5,0.25,0.075,0.1,0.3,0.75,0.525,0.369,0.1,0.1,0.363,0.479,0.294,0.02,0]},{"value":"1","position":0,"sample":[0.094,0.312,0.261,0.184,0.313,0.438,0.807,0.463,0.193,0.25,0.219,0.607,0.388,0.167,0.3,0.2,0.525,0.364,0.25,0.431,0.172,0.538,0.379,0.341,0.396,0.125,0.541,0.367,0.372,0.396,0.1,0.25,0.155,0.162,0.21]},{"value":"1","position":1,"sample":[0.214,0.308,0.129,0.067,0.032,0.358,0.629,0.133,0.05,0.282,0.388,0.608,0.213,0.033,0.281,0.225,0.625,0.304,0.163,0.236,0.15,0.592,0.217,0.225,0.227,0.329,0.508,0.229,0.163,0.246,0.228,0.215,0.103,0.017,0.134]},{"value":"1","position":2,"sample":[0.525,0.25,0.167,0.125,0.063,0.6,0.4,0.667,0.3,0.146,0.5,0.5,0.792,0.4,0,0.6,0.5,0.75,0.425,0,0.7,0.5,0.75,0.375,0.021,0.6,0.375,0.5,0.225,0.125,0.25,0.125,0.083,0.025,0.021]},{"value":"1","position":3,"sample":[0.125,0.083,0.271,0.08,0.05,0.138,0.127,0.429,0.182,0.125,0.029,0.02,0.296,0.21,0.133,0.192,0.135,0.322,0.389,0.232,0.2,0.035,0.237,0.366,0.123,0.196,0.067,0.342,0.272,0.217,0.083,0.067,0.185,0.098,0.051]},{"value":"1","position":4,"sample":[0.854,0.5,0.083,0,0,0.733,0.667,0.317,0.083,0,0.771,0.646,0.417,0.188,0.021,0.633,0.8,0.583,0.317,0.15,0.5,0.667,0.583,0.292,0.063,0.667,0.55,0.35,0.133,0,0.389,0.25,0.156,0.05,0]},{"value":"1","position":5,"sample":[0.243,0.075,0.063,0.256,0.083,0.5,0.308,0.285,0.556,0.189,0.593,0.283,0.157,0.593,0.207,0.506,0.207,0.083,0.417,0.174,0.509,0.162,0.083,0.442,0.242,0.611,0.097,0.104,0.458,0.258,0.191,0,0.033,0.214,0.094]},{"value":"2","position":0,"sample":[0,0.25,0.531,0.438,0.297,0.125,0.5,0.229,0.286,0.578,0,0.052,0,0.208,0.578,0,0,0.13,0.505,0.531,0,0.234,0.667,0.604,0.125,0.271,0.719,0.526,0.13,0.109,0.242,0.429,0.242,0.121,0.144]},{"value":"2","position":1,"sample":[0.092,0.469,0.45,0.531,0.087,0.45,0.925,0.6,0.775,0.25,0.508,0.575,0.5,0.725,0.225,0.525,0.4,0.65,0.85,0.175,0.55,0.65,0.875,0.575,0.25,0.325,0.675,0.775,0.525,0.225,0.025,0.25,0.342,0.3,0.125]},{"value":"2","position":2,"sample":[0.139,0.315,0.283,0.108,0.067,0.378,0.472,0.26,0.267,0.233,0.351,0.331,0.152,0.439,0.383,0.218,0.188,0.291,0.381,0.31,0.199,0.317,0.292,0.264,0.197,0.318,0.353,0.183,0.325,0.25,0.198,0.262,0.147,0.182,0.057]},{"value":"2","position":3,"sample":[0.183,0.15,0.333,0.267,0.083,0.167,0.367,0.417,0.433,0.25,0.3,0.117,0.15,0.383,0.319,0.31,0.027,0.193,0.44,0.225,0.283,0.15,0.517,0.317,0.097,0.333,0.4,0.417,0.233,0.097,0.133,0.187,0.2,0.2,0.133]},{"value":"2","position":4,"sample":[0.307,0.208,0.329,0.363,0.063,0.485,0.346,0.411,0.567,0.205,0.326,0.063,0.155,0.515,0.223,0.25,0,0.175,0.446,0.219,0.26,0.295,0.411,0.222,0.158,0.521,0.642,0.401,0.225,0.094,0.203,0.233,0.168,0.1,0.025]},{"value":"2","position":5,"sample":[0,0,0.089,0.056,0.089,0.028,0.167,0.256,0.056,0.089,0.167,0.5,0.5,0.167,0,0.333,0.667,0.667,0.333,0,0.167,0.5,0.5,0.167,0,0.139,0.167,0.167,0,0,0.104,0,0,0,0]},{"value":"3","position":0,"sample":[0.15,0.433,0.367,0.486,0.225,0.25,0.338,0.267,0.567,0.513,0,0,0.208,0.608,0.388,0,0,0.183,0.583,0.525,0.05,0.042,0,0.183,0.504,0.45,0.654,0.183,0.163,0.288,0.113,0.367,0.18,0.1,0.095]},{"value":"3","position":1,"sample":[0.219,0.356,0.15,0.094,0.2,0.281,0.481,0.375,0.281,0.3,0.094,0.394,0.3,0.056,0.275,0.15,0.3,0.4,0.15,0.345,0,0.375,0.431,0.081,0.225,0.406,0.531,0.087,0.219,0.175,0.281,0.3,0,0.025,0.08]},{"value":"3","position":2,"sample":[0.059,0.09,0.181,0.309,0.185,0.255,0.315,0.402,0.396,0.188,0.207,0.287,0.439,0.457,0.103,0.25,0.314,0.462,0.574,0.166,0.317,0.34,0.323,0.317,0.141,0.208,0.239,0.35,0.365,0.179,0.124,0.062,0.141,0.175,0.094]},{"value":"3","position":3,"sample":[0.15,0.45,0.383,0.05,0.125,0.35,0.5,0.575,0.175,0.175,0.125,0.4,0.6,0.125,0,0,0.145,0.447,0.325,0,0.1,0.025,0.375,0.7,0.183,0.2,0.3,0.625,0.575,0.283,0,0.18,0.196,0.103,0]},{"value":"3","position":4,"sample":[0.025,0.267,0.417,0.2,0.104,0.05,0.367,0.604,0.525,0.271,0,0.042,0.313,0.242,0.292,0.181,0.156,0.229,0.225,0.125,0.375,0.358,0.063,0.508,0.167,0.142,0.383,0.146,0.558,0.479,0,0.125,0.104,0.119,0.156]},{"value":"3","position":5,"sample":[0.063,0.075,0.188,0.192,0,0.088,0.138,0.396,0.45,0.025,0.1,0.335,0.668,0.561,0.033,0.2,0.413,0.629,0.679,0.142,0.213,0.367,0.372,0.511,0.218,0.308,0.363,0.254,0.271,0.063,0.096,0.16,0.104,0.088,0]},{"value":"4","position":0,"sample":[0,0.063,0.306,0.288,0.223,0,0.149,0.601,0.597,0.54,0,0.183,0.536,0.56,0.51,0.123,0.285,0.455,0.433,0.444,0.26,0.45,0.543,0.363,0.487,0.368,0.5,0.563,0.522,0.44,0.092,0.158,0.264,0.291,0.258]},{"value":"4","position":1,"sample":[0.37,0.114,0.125,0.016,0.281,0.443,0.482,0.198,0,0.309,0.197,0.556,0.301,0.063,0.358,0.347,0.543,0.283,0.13,0.183,0.431,0.394,0.252,0.2,0.244,0.447,0.174,0.217,0.195,0.269,0.203,0.016,0.079,0.109,0.133]},{"value":"4","position":2,"sample":[0.139,0.139,0.222,0.296,0.081,0.25,0.31,0.417,0.593,0.32,0.097,0.384,0.417,0.498,0.183,0.118,0.363,0.394,0.366,0.1,0.382,0.618,0.428,0.333,0.3,0.583,0.442,0.244,0.292,0.15,0.208,0.083,0.017,0.083,0]},{"value":"4","position":3,"sample":[0,0.083,0.222,0.5,0.083,0.333,0.75,0.556,0.667,0.667,0.444,0.833,0.111,0.083,0.583,0.167,0.438,0,0.125,0.125,0,0.167,0.111,0.667,0.5,0.111,0.75,0.444,0.417,0.75,0.083,0.375,0.083,0,0.5]},{"value":"4","position":4,"sample":[0.139,0,0.111,0.067,0,0.118,0.056,0.272,0.211,0,0.222,0.188,0.417,0.494,0.122,0.378,0.194,0.389,0.394,0.078,0.519,0.293,0.339,0.261,0,0.325,0.087,0.217,0.171,0.233,0.056,0,0.05,0.05,0.15]},{"value":"4","position":5,"sample":[0.084,0.033,0.145,0.312,0.11,0.165,0.114,0.346,0.488,0.122,0.162,0.237,0.395,0.471,0.053,0.141,0.371,0.383,0.46,0.067,0.264,0.369,0.362,0.438,0.112,0.245,0.39,0.352,0.53,0.238,0.021,0.112,0.118,0.246,0.095]},{"value":"5","position":0,"sample":[0.35,0.319,0,0,0,0.55,0.269,0,0.125,0.075,0.6,0.525,0.15,0.3,0.075,0.156,0.244,0.131,0.213,0.156,0,0,0,0.5,0.356,0,0,0.125,0.488,0.225,0,0.025,0.175,0.11,0.12]},{"value":"5","position":1,"sample":[0.146,0.271,0.306,0.243,0.117,0.292,0.521,0.554,0.292,0.317,0.292,0.438,0.525,0.146,0.217,0.354,0.465,0.817,0.528,0.15,0.104,0.083,0.4,0.479,0.167,0.125,0.208,0.138,0.125,0.117,0.104,0.125,0.083,0,0.117]},{"value":"5","position":2,"sample":[0.161,0.244,0.278,0.272,0.186,0.342,0.267,0.304,0.1,0.111,0.496,0.175,0.4,0.25,0.244,0.429,0.212,0.368,0.2,0.206,0.404,0.237,0.521,0.304,0.181,0.446,0.35,0.542,0.321,0.375,0.127,0.147,0.208,0.2,0.167]},{"value":"5","position":3,"sample":[0.111,0,0,0.333,0.333,0.417,0,0.125,0.688,0.25,0.333,0,0,0.063,0,0.333,0,0,0,0,0.333,0,0,0,0,0.5,0,0,0,0,0.333,0,0,0,0]},{"value":"5","position":5,"sample":[0.259,0.111,0,0,0,0.12,0.083,0.083,0.083,0,0,0.083,0.25,0.25,0.056,0.083,0.25,0.333,0.361,0.139,0.167,0.333,0.271,0.278,0.104,0.222,0.306,0.083,0.083,0.063,0.083,0.083,0,0.083,0.063]},{"value":"6","position":0,"sample":[0.049,0.438,0.388,0.313,0.288,0.34,0.917,0.45,0.292,0.371,0.486,0.875,0.6,0.347,0.417,0.561,0.9,0.525,0.537,0.6,0.375,0.771,0.354,0.354,0.608,0.111,0.667,0.608,0.563,0.646,0,0.204,0.35,0.311,0.192]},{"value":"6","position":1,"sample":[0.347,0.132,0.285,0.213,0.129,0.582,0.403,0.395,0.322,0.368,0.555,0.367,0.453,0.49,0.322,0.615,0.568,0.461,0.552,0.349,0.563,0.64,0.32,0.528,0.366,0.295,0.38,0.44,0.528,0.313,0.076,0.108,0.272,0.316,0.104]},{"value":"6","position":2,"sample":[0.182,0.193,0.26,0.405,0.297,0.526,0.515,0.485,0.641,0.405,0.453,0.392,0.484,0.488,0.24,0.346,0.474,0.619,0.445,0.202,0.422,0.427,0.422,0.354,0.372,0.396,0.449,0.408,0.51,0.213,0.229,0.183,0.245,0.328,0.097]},{"value":"6","position":3,"sample":[0.113,0.157,0.258,0.147,0.18,0.203,0.418,0.472,0.146,0.208,0.336,0.469,0.383,0.06,0.138,0.438,0.305,0.429,0.248,0.178,0.354,0.175,0.313,0.324,0.263,0.286,0.353,0.388,0.313,0.185,0.11,0.139,0.125,0.123,0.052]},{"value":"6","position":4,"sample":[0.18,0.268,0.23,0.177,0.185,0.285,0.461,0.354,0.362,0.262,0.407,0.452,0.263,0.207,0.182,0.314,0.384,0.302,0.285,0.227,0.392,0.385,0.297,0.283,0.38,0.377,0.616,0.455,0.296,0.192,0.144,0.261,0.24,0.088,0.04]},{"value":"7","position":0,"sample":[0.25,0.292,0.2,0.25,0.158,0.469,0.594,0.5,0.313,0.244,0.125,0.125,0.175,0.094,0.125,0,0,0.083,0.219,0.275,0,0,0.167,0.219,0.05,0,0.031,0.292,0.125,0.05,0,0.031,0.167,0.031,0.175]},{"value":"7","position":1,"sample":[0.25,0.25,0.117,0.15,0.433,0.301,0.556,0.243,0.3,0.68,0.41,0.667,0.375,0.353,0.656,0.467,0.533,0.339,0.417,0.478,0.517,0.408,0.13,0.433,0.38,0.563,0.378,0.073,0.417,0.317,0.2,0.089,0,0.1,0.173]},{"value":"7","position":2,"sample":[0,0.25,0.05,0.2,0,0.1,0.3,0.05,0.2,0,0.3,0.05,0.05,0,0,0.4,0,0.35,0.2,0,0.25,0,0.05,0.05,0.3,0.05,0,0.05,0,0.5,0,0.04,0.2,0,0.12]},{"value":"7","position":3,"sample":[0.187,0.173,0.287,0.3,0.154,0.257,0.275,0.24,0.417,0.233,0.167,0.117,0.26,0.27,0.27,0.263,0.177,0.48,0.35,0.355,0.26,0.254,0.372,0.28,0.371,0.261,0.259,0.31,0.19,0.366,0.123,0.073,0.136,0.082,0.26]},{"value":"7","position":4,"sample":[0.156,0.067,0.083,0.094,0.028,0.422,0.183,0.167,0.228,0.228,0.389,0.333,0.357,0.191,0.201,0.333,0.361,0.483,0.233,0.067,0.222,0.458,0.383,0.083,0,0.244,0.356,0.2,0.111,0.028,0.217,0.095,0,0.083,0.021]},{"value":"7","position":5,"sample":[0.042,0.111,0.028,0,0,0.042,0.299,0.278,0.063,0,0.188,0.563,0.625,0.313,0.042,0.375,0.75,0.75,0.5,0.083,0.188,0.563,0.625,0.34,0.042,0,0.188,0.306,0.257,0.056,0,0,0.021,0.083,0.021]},{"value":"8","position":0,"sample":[0.063,0.344,0.438,0.344,0.025,0.438,0.75,0.25,0.563,0.25,0.438,0.688,0.156,0.688,0.35,0.194,0.894,0.7,0.813,0.13,0.625,0.594,0.063,0.438,0.35,0.5,0.531,0.094,0.563,0.475,0.1,0.35,0.225,0.375,0.08]},{"value":"8","position":1,"sample":[0.25,0.25,0.7,0.7,0.208,0.5,0.7,1,1,0.708,0.4,0.64,1,0.96,0.333,0.45,0.65,0.95,0.95,0.333,0.68,0.84,0.8,1,0.833,0.5,0.7,0.95,1,0.5,0.2,0.2,0.52,0.4,0.033]},{"value":"8","position":2,"sample":[0.167,0.375,0.542,0.5,0.031,0.417,0.469,0.542,0.813,0.219,0.583,0.663,0.492,0.725,0.15,0.542,0.563,0.448,0.656,0.25,0.583,0.5,0.442,0.725,0.325,0.5,0.469,0.333,0.438,0.094,0.1,0.2,0.267,0.213,0.031]},{"value":"8","position":3,"sample":[0.161,0.188,0.338,0.146,0.233,0.479,0.354,0.516,0.379,0.379,0.385,0.571,0.464,0.192,0.517,0.389,0.711,0.568,0.122,0.473,0.625,0.608,0.485,0.317,0.521,0.547,0.508,0.49,0.446,0.529,0.237,0.297,0.229,0.13,0.156]},{"value":"8","position":4,"sample":[0.142,0.266,0.24,0.106,0.042,0.412,0.55,0.385,0.166,0.115,0.397,0.681,0.552,0.228,0.01,0.192,0.697,0.594,0.338,0.078,0.203,0.313,0.302,0.334,0.141,0.291,0.269,0.146,0.231,0.156,0.061,0.153,0.067,0.051,0.063]},{"value":"8","position":5,"sample":[0,0.25,0.194,0.194,0.067,0.167,0.583,0.438,0.417,0.212,0.208,0.646,0.5,0.25,0.058,0.194,0.694,0.694,0.333,0,0.146,0.604,0.542,0.375,0.083,0.188,0.479,0.208,0.208,0.083,0.042,0.167,0.021,0.021,0]},{"value":"9","position":0,"sample":[0.094,0.39,0.441,0.353,0.072,0.5,0.697,0.356,0.613,0.419,0.59,0.682,0.188,0.548,0.5,0.349,0.781,0.472,0.756,0.625,0.143,0.379,0.316,0.684,0.515,0.276,0.534,0.528,0.653,0.306,0.028,0.243,0.313,0.182,0.016]},{"value":"9","position":1,"sample":[0.292,0.153,0.075,0.213,0.333,0.453,0.341,0.244,0.373,0.417,0.406,0.3,0.234,0.394,0.325,0.518,0.451,0.376,0.396,0.389,0.344,0.275,0.287,0.334,0.438,0.313,0.262,0.219,0.399,0.438,0.166,0.153,0.085,0.134,0.237]},{"value":"9","position":2,"sample":[0.069,0.194,0.133,0,0.214,0.299,0.472,0.328,0.028,0.306,0.347,0.472,0.233,0.056,0.411,0.271,0.424,0.339,0.229,0.4,0.153,0.361,0.494,0.139,0.156,0.104,0.257,0.472,0.056,0.111,0,0.049,0.133,0.021,0.233]},{"value":"9","position":3,"sample":[0.325,0.347,0.246,0.247,0.057,0.538,0.475,0.171,0.369,0.151,0.261,0.256,0.224,0.545,0.182,0.162,0.325,0.474,0.681,0.261,0.146,0.296,0.398,0.511,0.063,0.198,0.37,0.273,0.469,0.302,0.154,0.269,0.225,0.181,0.227]},{"value":"9","position":4,"sample":[0.032,0,0.099,0.166,0,0.036,0.1,0.177,0.207,0,0.179,0.268,0.235,0.276,0.079,0.289,0.395,0.321,0.352,0.136,0.194,0.186,0.315,0.343,0.155,0.206,0.132,0.305,0.219,0.055,0.031,0.067,0.118,0.057,0]},{"value":"9","position":5,"sample":[0.1,0.163,0.063,0.15,0.03,0.247,0.292,0.129,0.279,0.144,0.401,0.517,0.3,0.35,0.222,0.26,0.529,0.488,0.467,0.147,0.147,0.342,0.363,0.325,0.113,0.189,0.329,0.275,0.2,0.05,0.035,0.129,0.088,0.063,0]}];

export async function readValidateNumberFromImage(
  image: ValidateNumberImageInput,
  options: {
    contentType?: string;
  } = {}
): Promise<ValidateNumberOcrResult> {
  const { imageBytes, contentType } = await normalizeImageInput(image, options.contentType);
  return readValidateNumberCaptchaBytes(imageBytes, contentType);
}

export function readValidateNumberCaptchaBytes(
  imageBytes: ArrayBuffer,
  contentType = "image/jpeg"
): ValidateNumberOcrResult {
  const normalizedContentType = contentType.toLowerCase();
  if (normalizedContentType !== "image/jpeg" && normalizedContentType !== "image/jpg") {
    throw new Error("Only JPEG validation-number images are supported.");
  }

  const decoded = decodeJpeg(new Uint8Array(imageBytes), { useTArray: true });
  const binary = binarize(decoded.data, decoded.width, decoded.height);
  const denoised = removeSparseNoise(binary, decoded.width, decoded.height);
  const cleaned = openLines(denoised, decoded.width, decoded.height);
  const bounds = findDigitBounds(cleaned, decoded.width, decoded.height);
  const digitBoxes = splitDigitBounds(bounds, decoded.width, decoded.height, 6);

  const digits = digitBoxes.map((box) => recognizeDigit(cleaned, decoded.width, decoded.height, box));
  return {
    text: digits.map((digit) => digit.value).join(""),
    confidence: digits.reduce((sum, digit) => sum + digit.confidence, 0) / Math.max(digits.length, 1),
    width: decoded.width,
    height: decoded.height,
    digits
  };
}

async function normalizeImageInput(image: ValidateNumberImageInput, contentType?: string) {
  if (image instanceof Blob) {
    return {
      imageBytes: await image.arrayBuffer(),
      contentType: contentType ?? (image.type || "image/jpeg")
    };
  }

  if (image instanceof Uint8Array) {
    const imageBytes = new ArrayBuffer(image.byteLength);
    new Uint8Array(imageBytes).set(image);

    return {
      imageBytes,
      contentType: contentType ?? "image/jpeg"
    };
  }

  return {
    imageBytes: image,
    contentType: contentType ?? "image/jpeg"
  };
}

function binarize(data: Uint8Array | Buffer, width: number, height: number) {
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset] ?? 255;
      const g = data[offset + 1] ?? 255;
      const b = data[offset + 2] ?? 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const saturation = max - min;

      // ponytail: dark AND desaturated = digit ink; colored noise lines (high saturation) excluded
      out[y * width + x] = gray < 170 && saturation < 80 ? 1 : 0;
    }
  }

  return out;
}

function removeSparseNoise(input: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(input.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (!input[i]) {
        continue;
      }

      let neighbors = 0;
      for (let yy = -1; yy <= 1; yy += 1) {
        for (let xx = -1; xx <= 1; xx += 1) {
          if (xx === 0 && yy === 0) {
            continue;
          }
          neighbors += input[(y + yy) * width + x + xx] ?? 0;
        }
      }

      out[i] = neighbors >= 2 ? 1 : 0;
    }
  }

  return out;
}

// Morphological opening (erode then dilate) on the 4-neighbourhood. A 1-2px noise
// line — horizontal, vertical, or diagonal — has no perpendicular support, so erosion
// deletes it; 3px+ digit strokes survive and dilation restores their width. This is
// what lets the noisy captcha batches survive segmentation. Prototypes are generated
// with this step applied, so it must run before findDigitBounds/recognizeDigit.
function openLines(input: Uint8Array, width: number, height: number) {
  const eroded = new Uint8Array(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!input[i]) {
        continue;
      }
      const up = y > 0 ? input[i - width] : 0;
      const down = y < height - 1 ? input[i + width] : 0;
      const left = x > 0 ? input[i - 1] : 0;
      const right = x < width - 1 ? input[i + 1] : 0;
      eroded[i] = up && down && left && right ? 1 : 0;
    }
  }

  const dilated = new Uint8Array(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const up = y > 0 ? eroded[i - width] : 0;
      const down = y < height - 1 ? eroded[i + width] : 0;
      const left = x > 0 ? eroded[i - 1] : 0;
      const right = x < width - 1 ? eroded[i + 1] : 0;
      dilated[i] = eroded[i] || up || down || left || right ? 1 : 0;
    }
  }

  return dilated;
}

function findDigitBounds(input: Uint8Array, width: number, height: number): Box {
  const minY = Math.max(0, Math.floor(height * 0.12));
  const maxY = Math.min(height - 1, Math.ceil(height * 0.86));
  const projection = new Array<number>(width).fill(0);

  for (let x = 0; x < width; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      projection[x] += input[y * width + x] ?? 0;
    }
  }

  const smoothed = projection.map((value, index) => value + (projection[index - 1] ?? 0) + (projection[index + 1] ?? 0));
  const threshold = Math.max(3, Math.floor(height * 0.12));
  let minX = smoothed.findIndex((value) => value >= threshold);
  let maxX = smoothed.length - 1 - [...smoothed].reverse().findIndex((value) => value >= threshold);

  if (minX < 0 || maxX < minX) {
    minX = Math.floor(width * 0.04);
    maxX = Math.floor(width * 0.84);
  }

  return {
    minX: Math.max(0, minX - 1),
    maxX: Math.min(width - 1, maxX + 1),
    minY,
    maxY
  };
}

function splitDigitBounds(bounds: Box, width: number, height: number, count: number) {
  const totalWidth = bounds.maxX - bounds.minX + 1;
  const digitWidth = totalWidth / count;

  return Array.from({ length: count }, (_, index) => ({
    position: index,
    minX: Math.max(0, Math.floor(bounds.minX + index * digitWidth - 1)),
    maxX: Math.min(width - 1, Math.ceil(bounds.minX + (index + 1) * digitWidth + 1)),
    minY: bounds.minY,
    maxY: Math.min(height - 1, bounds.maxY)
  }));
}

function recognizeDigit(input: Uint8Array, width: number, height: number, box: Box) {
  const sample = sampleBox(input, width, height, box);
  let best = { value: "", score: Number.POSITIVE_INFINITY };

  for (const prototype of DIGIT_PROTOTYPES) {
    const positionPenalty = prototype.position === box.position ? 0 : 0.03;
    const score = compareSampleToTemplate(sample, prototype.sample) + positionPenalty;
    const value = prototype.value;
    if (score < best.score) {
      best = { value, score };
    }
  }

  return {
    value: best.value,
    confidence: Math.max(0, Math.min(1, 1 - best.score))
  };
}

function sampleBox(input: Uint8Array, width: number, height: number, box: Box) {
  const cropped = tightenBox(input, width, height, box);
  const sample = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT);

  for (let sy = 0; sy < SAMPLE_HEIGHT; sy += 1) {
    for (let sx = 0; sx < SAMPLE_WIDTH; sx += 1) {
      const startX = Math.floor(cropped.minX + (sx / SAMPLE_WIDTH) * (cropped.maxX - cropped.minX + 1));
      const endX = Math.floor(cropped.minX + ((sx + 1) / SAMPLE_WIDTH) * (cropped.maxX - cropped.minX + 1));
      const startY = Math.floor(cropped.minY + (sy / SAMPLE_HEIGHT) * (cropped.maxY - cropped.minY + 1));
      const endY = Math.floor(cropped.minY + ((sy + 1) / SAMPLE_HEIGHT) * (cropped.maxY - cropped.minY + 1));
      let filled = 0;
      let total = 0;

      for (let y = startY; y <= Math.min(height - 1, endY); y += 1) {
        for (let x = startX; x <= Math.min(width - 1, endX); x += 1) {
          filled += input[y * width + x] ?? 0;
          total += 1;
        }
      }

      sample[sy * SAMPLE_WIDTH + sx] = total ? filled / total : 0;
    }
  }

  return sample;
}

function tightenBox(input: Uint8Array, width: number, height: number, box: Box): Box {
  let minX = box.maxX;
  let maxX = box.minX;
  let minY = box.maxY;
  let maxY = box.minY;

  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      if (input[y * width + x]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX > maxX || minY > maxY) {
    return box;
  }

  return {
    minX: Math.max(0, minX - 1),
    maxX: Math.min(width - 1, maxX + 1),
    minY: Math.max(0, minY - 1),
    maxY: Math.min(height - 1, maxY + 1)
  };
}

function compareSampleToTemplate(sample: Float32Array, template: number[]) {
  let diff = 0;

  for (let i = 0; i < sample.length; i += 1) {
    const expected = template[i] ?? 0;
    const actual = sample[i] ?? 0;
    diff += Math.abs(expected - actual);
  }

  return diff / sample.length;
}
