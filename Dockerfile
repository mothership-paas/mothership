FROM ruby:2.6
COPY ./public/uploads/myapp.zip /usr/src/app/
WORKDIR /usr/src/app
RUN unzip myapp.zip
RUN bundle install
EXPOSE 4567

CMD ["bundle", "exec", "puma", "-t", "5:5", "-p", "4567"]
