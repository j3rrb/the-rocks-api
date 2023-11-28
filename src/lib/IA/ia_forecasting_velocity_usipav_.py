# -*- coding: utf-8 -*-
from bson.objectid import ObjectId
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

server_api = ServerApi('1')
client = MongoClient("mongodb+srv://classe:senai123@cluster0.hpvcvwz.mongodb.net/", server_api=server_api)

client.server_info()

db = client.get_database('therocks')
collection = db.get_collection('sensor_data')
collection_files = list(collection.find())

"""#Preparação de Dados"""

from collections import defaultdict
from bson import json_util
import json
import os
import time
from datetime import datetime
import pandas as pd
import numpy as np
import plotly.express as px
import tensorflow as tf

from pandas import json_normalize

df_dump = json_normalize(collection_files[:-1])
print(type(df_dump))

df_dump = df_dump # limitador de memória utilizada

print(df_dump.shape)

records = df_dump.to_dict('records')
print(records[0])

df_dump['timestamp'] = pd.to_datetime(df_dump.timestamp , format = '%Y-%m-%d %H:%M:%S')
data = df_dump.drop(['timestamp'], axis=1)
data.index = df_dump.timestamp

cols = data.columns
for j in cols:
    for i in range(0,len(data)):
       if data[j][i] == None or data[j][i] == 'YourSensorValue':
        data[j][i] = data[j][i-1]

for i in range(len(data)):
  try:
    del data['a']
    del data['timestamp']
  except:
    pass

data = data.sort_values(by=['timestamp'])
data = data.dropna()
print(data)

"""#Matriz de Alertas"""

data['Alert_Velocity'] = np.where(((data['SensorId']=='S14') | (data['SensorId']=='S15')) & ((1500 > data['Value']) | (data['Value'] > 1900)), 1, 0) #Velocidade Esteira e Elevador

data['Alert_Level'] = np.where(((data['SensorId']=='S01') | (data['SensorId']=='S06') | (data['SensorId']=='S10') | (data['SensorId']=='S12')) & ((70 > data['Value']) | (data['Value'] > 100)), 1, 0)

data['Alert_Temperature_Asphalt'] = np.where((data['SensorId']=='S09') & ((100 > data['Value']) | (data['Value'] > 140)), 1, 0)

data['Alert_Temperature_MixQ'] = np.where((data['SensorId']=='S07') & ((100 > data['Value']) | (data['Value'] > 140)), 1, 0)

data['Alert_Temperature_MixB'] = np.where((data['SensorId']=='S05') & ((160 > data['Value']) | (data['Value'] > 210)), 1, 0)

data['Alert_Temperature_Aggregate'] = np.where((data['SensorId']=='S03') & ((100 > data['Value']) | (data['Value'] > 140)), 1, 0)

data['Alert_Velocity_Fuel'] = np.where((data['SensorId']=='S05') & ((100 > data['Value']) | (data['Value'] > 400)), 1, 0)

data['Alert_Flow_Fuel'] = np.where(((data['SensorId']=='S11') | (data['SensorId']=='S06')) & ((7000 > data['Value']) | (data['Value'] > 12000)), 1, 0)

data['Alert_Flow_Asphalt'] = np.where((data['SensorId']=='S08') & ((7000 > data['Value']) | (data['Value'] > 12000)), 1, 0)

data['Alert_Flow_Additions'] = np.where((data['SensorId']=='S13') & ((1000 > data['Value']) | (data['Value'] > 3000)), 1, 0)

data['Alert_Weight'] = np.where((data['SensorId']=='S02') & ((500 > data['Value']) | (data['Value'] > 900)), 1, 0)

data['Alert_Load'] = np.where((data['SensorId']=='S04') & ((500 > data['Value']) | (data['Value'] > 900)), 1, 0)

print(data)

"""# IA: Separação de datasets

"""

from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras.optimizers import Adam
from keras.models import Sequential
from keras.layers import LSTM, Dense
from sklearn.model_selection import train_test_split

def test_train_sensor(sensor, test_size=0.33, random_state=42):
  x = []
  y = []
  for i in range(len(sensor)):
    x.append(sensor[i]['Value'])
    y.append(sensor[i]['timestamp'])
  X_train, X_test, y_train, y_test = train_test_split(x, y, test_size=test_size, random_state=random_state)
  return X_train, X_test, y_train, y_test


# sensor_1 = test_train_sensor(S01)
# sensor_2 = test_train_sensor(S02)

print(data.head(20))

X, set_test = train_test_split(data, test_size=0.30, random_state=42)
set_train, set_validation = train_test_split(X, test_size=0.2, random_state=42)

print(len(set_test))
print(len(set_train))
print(len(set_validation))

set_test.info()
set_train.info()
set_validation.info()

set_train.head()

print(set_train.groupby('SensorId').size())
print(set_train.groupby('MachineId').size())


#Prophet


df_velocity_belt = data.loc[data['SensorId']=='S15', "Value"]
df_velocity_elevator = data.loc[data['SensorId']=='S14', "Value"]

df_velocity_belt = df_velocity_belt.dropna()
df_velocity_belt = df_velocity_elevator.dropna()

df_velocity_belt.head(20)

from prophet import Prophet

# df_velocity_elevator
ds = df_velocity_belt.index
y  = df_velocity_belt

df_prophet = pd.DataFrame(list(zip(ds, y)))
df_prophet.columns = ['ds', 'y']
# print(df_prophet)

m = Prophet()
m.fit(df_prophet)

future = m.make_future_dataframe(periods=12)
future.tail()

forecast = m.predict(future)
forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail()

df_velocity_belt_fig1 = m.plot(forecast)

df_velocity_belt_fig2 = m.plot_components(forecast)

from prophet.plot import plot_plotly, plot_components_plotly

plot_plotly(m, forecast)

plot_components_plotly(m, forecast)

# df_velocity_elevator
ds = df_velocity_elevator.index
y  = df_velocity_elevator

df_prophet = pd.DataFrame(list(zip(ds, y)))
df_prophet.columns = ['ds', 'y']
# print(df_prophet)

m = Prophet()
m.fit(df_prophet)

future = m.make_future_dataframe(periods=21)
future.tail()

forecast2 = m.predict(future)
forecast2[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail()

df_velocity_belt_fig1 = m.plot(forecast2)

df_velocity_belt_fig2 = m.plot_components(forecast2)

# import statsmodels.api as sm
# import statsmodels.tsa.vector_ar
# from patsy import dmatrices

# y, X = dmatrices('Velocity ~ Value + SensorId', data=data, return_type='dataframe')

# print('y', y)

# print('X', X)

#Taxa Binominal

p_success = (400/3001) #range sucesso / range possível == 0.13328890369876709
print(len(df_velocity_elevator))
success_binominal_probability = np.random.binomial(n=100, p=(400/3001), size=len(df_velocity_elevator))

num_successes = np.sum(success_binominal_probability)
num_failures = len(df_velocity_elevator) - num_successes

print(num_successes)
print(num_failures)

conversoes_esperadas = np.mean(success_binominal_probability)
print(conversoes_esperadas)

"""#Taxa de Erro"""

def taxa_erro_sensor(serie, faixa_min, faixa_max):
  failure_rate = serie.loc[((faixa_min > serie) | (serie > faixa_max))]
  failure_rate = len(failure_rate) / len(serie)
  return failure_rate

erro_elevador = taxa_erro_sensor(df_velocity_elevator, 1500, 1900)
erro_esteira  = taxa_erro_sensor(df_velocity_belt, 1500, 1900)

print(f'Taxa de erro de sensor de elevador: {round(erro_elevador * 100, 7)} %\nTaxa de erro de sensor de esteira: {round(erro_esteira * 100, 7)} %')

"""#Vector AutoRegressive (VAR)"""

# Commented out IPython magic to ensure Python compatibility.
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
# %matplotlib inline

data_VAR = data.loc[data['SensorId']=='S15', 'Value']

from statsmodels.tsa.stattools import adfuller

def adf_test(series,title=''):
    """
    Pass in a time series and an optional title, returns an ADF report
    """
    print(f'Augmented Dickey-Fuller Test: {title}')
    result = adfuller(series.dropna(),autolag='AIC') # .dropna() handles differenced data
    labels = ['ADF test statistic','p-value','# lags used','# observations']
    out = pd.Series(result[0:4],index=labels)
    for key,val in result[4].items():
        out[f'critical value ({key})']=val
    print(out.to_string())          # .to_string() removes the line "dtype: float64"
    if result[1] <= 0.05:
        print("Strong evidence against the null hypothesis")
        print("Reject the null hypothesis")
        print("Data has no unit root and is stationary")
    else:
        print("Weak evidence against the null hypothesis")
        print("Fail to reject the null hypothesis")
        print("Data has a unit root and is non-stationary")

adf_test(data_VAR)



#Keras Tuner

from kerastuner.engine.hyperparameters import HyperParameters
from kerastuner.tuners import RandomSearch

#Keras Tuner
def build_model(hp):
    model = Sequential()

    model.add(Dense(
      hp.Choice('units', [8, 16, 32]),
      activation='relu')
    )

    model.add(Dense(1, activation='relu'))

    model.compile(loss='mse')

    return model



tuner = RandomSearch( build_model,
    objective='val_loss',
    max_trials=5,
    directory='tuner_results'
    )